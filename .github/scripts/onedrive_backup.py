#!/usr/bin/env python3
"""Nightly backup of the live portal to OneDrive (backup@evergreencommunitycare.com).

Run by .github/workflows/nightly-backup.yml after the database dump files are made.
  * Uploads roles.sql, schema.sql and data.sql to  <folder>/database/<YYYY-MM-DD>/
  * Copies every new or changed uploaded file to  <folder>/files/<bucket>/<path>
  * Keeps 30 days of database copies plus the 1st of every month.
  * Records each run in public.backup_runs (shown on Admin -> Backup).
The OneDrive sign-in token lives in Supabase Vault (public.backup_get_token / backup_save_token).
"""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

LIVE = os.environ['LIVE']
SUPA = 'https://pstvuqzbehljlixqhwhw.supabase.co'
KEY = os.environ.get('SERVICE_KEY', '').strip()
PSQL = os.environ.get('PSQL', 'psql')
SCOPE = 'offline_access Files.ReadWrite User.Read'
TIME_BUDGET = 45 * 60          # stop copying files after 45 minutes; the rest go the next night
START = time.time()
TODAY = datetime.now(timezone(timedelta(hours=-7))).strftime('%Y-%m-%d')   # BC date


def sql(query, **vars_):
    args = [PSQL, LIVE, '-At', '-v', 'ON_ERROR_STOP=1']
    for k, v in vars_.items():
        args += ['-v', f'{k}={v}']
    out = subprocess.run(args + ['-f', '-'], input=query, capture_output=True, text=True)   # stdin, so :'var' is filled in
    if out.returncode:
        raise RuntimeError('database: ' + out.stderr.strip().splitlines()[-1][:200])
    return out.stdout.strip()


def http(method, url, data=None, headers=None, raw=False):
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            body = r.read()
            return r.status, (body if raw else (json.loads(body) if body else {}))
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {'error': body[:200].decode('utf-8', 'replace')}


def safe_path(p):
    # OneDrive doesn't allow " * : < > ? \ | in names.
    return '/'.join(re.sub(r'["*:<>?\\|]', '_', part).strip() or '_' for part in p.split('/'))


def graph_url(path):
    return 'https://graph.microsoft.com/v1.0/me/drive/root:/' + urllib.parse.quote(safe_path(path)) + ':'


class Drive:
    def __init__(self, access):
        self.h = {'Authorization': 'Bearer ' + access}

    def put(self, path, data):
        if len(data) <= 4 * 1024 * 1024:
            st, j = http('PUT', graph_url(path) + '/content', data, {**self.h, 'Content-Type': 'application/octet-stream'})
            if st >= 300:
                raise RuntimeError(f'OneDrive {st} on {path}: {j.get("error", {}).get("message", j) if isinstance(j, dict) else j}')
            return
        st, j = http('POST', graph_url(path) + '/createUploadSession', json.dumps({'item': {'@microsoft.graph.conflictBehavior': 'replace'}}).encode(), {**self.h, 'Content-Type': 'application/json'})
        if st >= 300:
            raise RuntimeError(f'OneDrive upload session {st} on {path}')
        up, size, chunk = j['uploadUrl'], len(data), 10 * 1024 * 1024
        for start in range(0, size, chunk):
            part = data[start:start + chunk]
            st2, j2 = http('PUT', up, part, {'Content-Length': str(len(part)), 'Content-Range': f'bytes {start}-{start + len(part) - 1}/{size}'})
            if st2 >= 300:
                raise RuntimeError(f'OneDrive chunk {st2} on {path}')

    def children(self, path):
        st, j = http('GET', graph_url(path) + '/children?$select=name,folder&$top=999', None, self.h)
        return j.get('value', []) if st < 300 else []

    def delete(self, path):
        http('DELETE', graph_url(path), None, self.h)


def main():
    run_id = sql("insert into public.backup_runs default values returning id")
    try:
        s = sql("select json_build_object('tenant', tenant_id, 'client', client_id, 'folder', folder, 'connected', connected_at is not null) from public.backup_settings where id = 1")
        s = json.loads(s) if s else {}
        if not s.get('connected'):
            sql("update public.backup_runs set finished_at = now(), ok = false, note = 'OneDrive not connected yet (Admin -> Backup).' where id = :'rid'", rid=run_id)
            print('OneDrive not connected yet.')
            return 0
        token = sql("select public.backup_get_token()")
        st, t = http('POST', f"https://login.microsoftonline.com/{s['tenant']}/oauth2/v2.0/token",
                     urllib.parse.urlencode({'grant_type': 'refresh_token', 'client_id': s['client'], 'refresh_token': token, 'scope': SCOPE}).encode(),
                     {'Content-Type': 'application/x-www-form-urlencoded'})
        if st >= 300:
            raise RuntimeError('Microsoft sign-in expired or was removed. Connect again on Admin -> Backup. (' + str(t.get('error')) + ')')
        if t.get('refresh_token'):
            sql("select public.backup_save_token(:'tok')", tok=t['refresh_token'])
        drive = Drive(t['access_token'])
        folder = s['folder'] or 'Evergreen CRM Backup'

        # 1. Database
        db_bytes = 0
        for name in ('roles.sql', 'schema.sql', 'data.sql'):
            with open(name, 'rb') as f:
                data = f.read()
            db_bytes += len(data)
            drive.put(f'{folder}/database/{TODAY}/{name}', data)
        drive.put(f'{folder}/database/{TODAY}/README.txt', (
            'Evergreen portal database copy, ' + TODAY + '.\n'
            'To restore into an empty Supabase project: run roles.sql, then schema.sql, then data.sql with psql '
            '(set session_replication_role = replica before data.sql). Uploaded files are in the "files" folder.\n').encode())
        print(f'Database: {db_bytes} bytes')

        # 2. Uploaded files (new or changed only)
        files_new = files_bytes = 0
        note = None
        if not KEY:
            note = 'Files not copied: add the LIVE_SERVICE_KEY secret in GitHub.'
        else:
            rows = sql("""select coalesce(json_agg(json_build_object('b', o.bucket_id, 'n', o.name, 's', coalesce((o.metadata->>'size')::bigint, 0))), '[]')
                            from storage.objects o
                            left join public.backup_files f on f.bucket = o.bucket_id and f.name = o.name
                           where o.name not like '%.emptyFolderPlaceholder'
                             and (f.name is null or f.size is distinct from coalesce((o.metadata->>'size')::bigint, 0))""")
            todo = json.loads(rows)
            for o in todo:
                if time.time() - START > TIME_BUDGET:
                    note = f'{len(todo) - files_new} files left for tomorrow night (time limit).'
                    break
                st, data = http('GET', f"{SUPA}/storage/v1/object/{o['b']}/" + urllib.parse.quote(o['n']), None,
                                {'Authorization': 'Bearer ' + KEY, 'apikey': KEY}, raw=True)
                if st >= 300:
                    print(f"skip {o['b']}/{o['n']}: {st}")
                    continue
                drive.put(f"{folder}/files/{o['b']}/{o['n']}", data)
                sql("insert into public.backup_files (bucket, name, size) values (:'b', :'n', :'s') on conflict (bucket, name) do update set size = excluded.size, backed_up_at = now()",
                    b=o['b'], n=o['n'], s=str(o['s']))
                files_new += 1
                files_bytes += len(data)
        files_total = int(sql("select count(*) from public.backup_files") or 0)
        print(f'Files: {files_new} new, {files_bytes} bytes, {files_total} in total')

        # 3. Keep 30 days of database copies, plus the 1st of each month
        cutoff = (datetime.strptime(TODAY, '%Y-%m-%d') - timedelta(days=30)).strftime('%Y-%m-%d')
        for c in drive.children(f'{folder}/database'):
            n = c.get('name', '')
            if re.fullmatch(r'\d{4}-\d{2}-\d{2}', n) and n < cutoff and not n.endswith('-01'):
                drive.delete(f'{folder}/database/{n}')

        sql("update public.backup_runs set finished_at = now(), ok = true, db_bytes = :'db', files_new = :'fn', files_bytes = :'fb', files_total = :'ft', note = nullif(:'note', '') where id = :'rid'",
            db=str(db_bytes), fn=str(files_new), fb=str(files_bytes), ft=str(files_total), note=note or '', rid=run_id)
        return 0
    except Exception as e:
        msg = str(e)[:300]
        print('Backup failed:', msg)
        try:
            sql("update public.backup_runs set finished_at = now(), ok = false, note = :'note' where id = :'rid'", note=msg, rid=run_id)
        except Exception:
            pass
        return 1


if __name__ == '__main__':
    sys.exit(main())
