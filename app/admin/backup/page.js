// 💾 Nightly backup to OneDrive: connection, and the last runs. Administrator sets it up; the CEO can see it.
// The copy itself runs every night on GitHub (.github/workflows/nightly-backup.yml). supabase/onedrive-backup.sql
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDateTime } from '@/lib/options';
import { startConnect, finishConnect, testUpload, disconnect } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Backup · Evergreen' };

const mb = (n) => (n == null ? '—' : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

export default async function Backup({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isAdmin = profile.role === 'admin';
  if (!isAdmin && !(levelOf(profile) >= 7 && !profile.staff_group)) redirect('/');
  const [{ data: s, error }, { data: runs }] = await Promise.all([
    supabase.from('backup_settings').select('tenant_id, client_id, account, connected_at, pending_user_code, pending_url, pending_until, folder').eq('id', 1).maybeSingle(),
    supabase.from('backup_runs').select('*').order('started_at', { ascending: false }).limit(14),
  ]);
  if (error && /does not exist|schema cache/i.test(error.message)) return <main><p><Link href="/admin">← Admin</Link></p><h1>💾 Backup</h1><p className="card">Not set up yet (supabase/onedrive-backup.sql).</p></main>;
  const last = (runs ?? [])[0];
  const lastOk = (runs ?? []).find((r) => r.ok);
  const stale = !lastOk || Date.now() - new Date(lastOk.finished_at ?? lastOk.started_at).getTime() > 30 * 3600e3;
  const pending = s?.pending_user_code && s?.pending_until && new Date(s.pending_until) > new Date();

  return (
    <main>
      <p><Link href="/admin">← Admin</Link></p>
      <h1>💾 Nightly backup to OneDrive</h1>
      <p className="muted">Every night at about 2 am the whole portal is copied to the OneDrive of backup@evergreencommunitycare.com: the full database (every record, readable text files) and every uploaded file (signed PDFs, photos, resumes). Only new or changed files are copied each night. Daily database copies are kept for 30 days, plus the first of every month.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Status</h2>
        {s?.connected_at
          ? <p>✅ Connected to <strong>{s.account ?? 'OneDrive'}</strong> since {fmtDateTime(s.connected_at)} · folder “{s.folder}”</p>
          : <p>❌ Not connected yet.</p>}
        {lastOk
          ? <p className={stale ? 'bad-text' : ''}>{stale ? '⚠️ ' : '✅ '}Last good backup: {fmtDateTime(lastOk.finished_at ?? lastOk.started_at)} · database {mb(lastOk.db_bytes)} · {lastOk.files_new ?? 0} new files ({mb(lastOk.files_bytes)}) · {lastOk.files_total ?? 0} files in total</p>
          : <p className="muted">No backup has run yet.</p>}
        {last && last.ok === false && <p className="message">The last run didn’t finish: {last.note ?? 'no reason given'} ({fmtDateTime(last.started_at)})</p>}
      </section>

      {isAdmin && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>{s?.connected_at ? 'Connection' : 'Connect the OneDrive (once)'}</h2>
          {pending ? (
            <>
              <p><strong>1.</strong> Open <a href={s.pending_url} target="_blank" rel="noreferrer">{s.pending_url}</a> (a private / incognito window is best).</p>
              <p><strong>2.</strong> Type this code: <strong style={{ fontSize: '1.4em', letterSpacing: 2 }}>{s.pending_user_code}</strong></p>
              <p><strong>3.</strong> Sign in as <strong>backup@evergreencommunitycare.com</strong> and press Accept.</p>
              <form action={finishConnect}><button>✓ I’ve signed in — finish</button></form>
              <p className="small muted">The code works until {fmtDateTime(s.pending_until)}.</p>
            </>
          ) : (
            <form action={startConnect}>
              <p className="small">From the app you made in Microsoft Entra (App registrations → “Evergreen CRM backup” → Overview):</p>
              <div className="row">
                <label>Directory (tenant) ID<input name="tenant_id" required defaultValue={s?.tenant_id ?? ''} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></label>
                <label>Application (client) ID<input name="client_id" required defaultValue={s?.client_id ?? ''} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></label>
              </div>
              <button>{s?.connected_at ? 'Connect again' : 'Get a sign-in code'}</button>
            </form>
          )}
          {s?.connected_at && !pending && (
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <form action={testUpload}><button className="secondary">Test the connection (saves a small file)</button></form>
              <form action={disconnect}><button className="secondary">Disconnect</button></form>
            </div>
          )}
          <p className="small muted">No password is typed into the portal. The sign-in is kept in Supabase Vault and only reaches backup@’s own OneDrive.</p>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Last 14 nights</h2>
        {!(runs ?? []).length && <p className="muted small">Nothing yet.</p>}
        <table>
          <thead><tr><th>Started</th><th>Result</th><th>Database</th><th>New files</th><th>Note</th></tr></thead>
          <tbody>
            {(runs ?? []).map((r) => (
              <tr key={r.id}>
                <td>{fmtDateTime(r.started_at)}</td>
                <td>{r.ok ? '✅' : r.ok === false ? '❌' : '…'}</td>
                <td>{mb(r.db_bytes)}</td>
                <td>{r.files_new ?? '—'} ({mb(r.files_bytes)})</td>
                <td className="small">{r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="small muted">The monthly <Link href="/admin/records-download">💾 Records download</Link> still works as an extra copy.</p>
    </main>
  );
}
