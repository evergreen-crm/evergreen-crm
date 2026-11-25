'use client';
// Admin: choose a folder on this computer, see every policy file in it matched to the library by its
// document code, tick the ones to upload, and publish them as new versions (or new policies).
// Nothing is uploaded until the Administrator presses the button.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createPolicy, publishVersion } from '@/app/policies/actions';
import { updatePolicyMeta } from './actions';
import { prepareOne, contentTypeFor } from '@/lib/uploadRules';

// D04_ECC-HR-BH-2026-001_Bullying_Harassment_Prevention_Policy_v1.1_BOTH.pdf
const NAME = /^(?:D\d{2}|00)_(ECC-[A-Z0-9-]+?)_(.+?)_v(\d+\.\d+)(?:_(BOTH|MCFD|CLBC))?\.(pdf|docx?)$/i;
const STREAM = { BOTH: 'Both', MCFD: 'MCFD', CLBC: 'CLBC' };
const num = (v) => { const [a, b] = String(v ?? '0').split('.'); return Number(a) * 1000 + Number(b ?? 0); };
const today = () => new Date().toLocaleDateString('en-CA');

export default function FolderUpload({ policies }) {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [folder, setFolder] = useState('');
  const [note, setNote] = useState('November 2026 library update: house format standardized (see the version history in the document).');
  const [effective, setEffective] = useState(today());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);

  function pick(e) {
    const files = [...(e.target.files ?? [])];
    setFolder(files[0]?.webkitRelativePath?.split('/')[0] ?? '');
    const best = {}; const other = [];
    for (const f of files) {
      const m = f.name.match(NAME);
      if (!m) { if (!f.name.startsWith('~$') && !/\.(xlsx|ini|db)$/i.test(f.name)) other.push(f.name); continue; }
      const [, code, title, version, stream, ext] = m;
      const cur = best[code];
      const isPdf = ext.toLowerCase() === 'pdf';
      // keep the highest version; for the same version prefer the PDF
      if (!cur || num(version) > num(cur.version) || (num(version) === num(cur.version) && isPdf && !cur.isPdf)) {
        best[code] = { code, version, stream: STREAM[(stream ?? 'BOTH').toUpperCase()], fileTitle: title.replace(/_/g, ' '), file: f, isPdf, path: f.webkitRelativePath || f.name };
      }
    }
    const list = Object.values(best).sort((a, b) => a.file.name.localeCompare(b.file.name)).map((r) => {
      const p = policies.find((x) => x.code === r.code);
      let status, on;
      if (!p) { status = 'New – not in the CRM yet'; on = false; }
      else if (!p.active) { status = 'Archived in the CRM'; on = false; }
      else if (!p.version || num(r.version) > num(p.version)) { status = `New version (CRM has v${p.version ?? '—'})`; on = true; }
      else if (num(r.version) === num(p.version)) { status = 'Already in the CRM'; on = false; }
      else { status = `Older than the CRM (v${p.version})`; on = false; }
      return { ...r, policy: p, status, on, title: p?.title ?? r.fileTitle, setProgram: !!p && p.applies_to !== r.stream, result: null };
    });
    setRows(list); setSkipped(other); setDone(0);
  }
  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.on);

  async function upload() {
    if (!chosen.length) return;
    if (!confirm(`Upload ${chosen.length} file(s)? Each new version asks staff to read and sign it again.`)) return;
    setBusy(true); setDone(0); setTotal(chosen.length);
    const supabase = createClient();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.on) continue;
      let result;
      try {
        const ready = await prepareOne(r.file);
        if (ready.error) throw new Error(ready.error);
        const file = ready.file;
        const path = `${r.policy?.id ?? 'new'}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
        const { error } = await supabase.storage.from('policies').upload(path, file, { contentType: contentTypeFor(file) });
        if (error) throw new Error('Upload failed: ' + error.message);
        const info = { file_path: path, file_name: file.name, file_type: contentTypeFor(file), version_label: r.version, change_note: note, effective_date: effective };
        let res;
        if (r.policy) {
          res = await publishVersion({ ...info, policy_id: r.policy.id });
          if (!res?.error && (r.setProgram || r.title !== r.policy.title)) {
            res = await updatePolicyMeta({ policy_id: r.policy.id, title: r.title, applies_to: r.setProgram ? r.stream : r.policy.applies_to });
          }
        } else {
          res = await createPolicy({ ...info, title: r.title, code: r.code, category: r.code.startsWith('ECC-ROLE-') ? 'Job descriptions' : 'Other', description: '', applies_to: r.stream, require_signature: false });
        }
        if (res?.error) throw new Error(res.error);
        result = { ok: true, text: `Uploaded v${r.version}` };
      } catch (e) {
        result = { ok: false, text: e.message };
      }
      set(i, { result, on: !result.ok });
      setDone((d) => d + 1);
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card">
      <p>Choose the folder that holds the policies, for example <strong>_Ready for CRM upload (Nov 24 2026)</strong> or its <strong>CRM Upload (PDF)</strong> folder. Sub-folders are included. Nothing is uploaded until you press the button below.</p>
      <label>Folder<input type="file" webkitdirectory="" directory="" multiple onChange={pick} disabled={busy} /></label>
      {rows.length > 0 && (
        <>
          <p className="small">Found <strong>{rows.length}</strong> policy file(s) in <strong>{folder}</strong>{skipped.length ? ` · ${skipped.length} other file(s) ignored` : ''}. Where a folder has both a PDF and a Word copy, the PDF is used. Files are matched to the library by their document code.</p>
          <div className="row">
            <label>What changed (for every file)<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <label>Effective date<input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></label>
          </div>
          <p className="small no-print">
            <button type="button" className="secondary" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, on: r.status.startsWith('New version') })))}>Tick new versions only</button>{' '}
            <button type="button" className="secondary" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, on: false })))}>Untick all</button>
          </p>
          <table>
            <thead><tr><th>Upload?</th><th>File</th><th>Title in the CRM</th><th>Version</th><th>Program</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.code}>
                  <td><input type="checkbox" checked={r.on} disabled={busy} onChange={(e) => set(i, { on: e.target.checked })} aria-label={`Upload ${r.code}`} /></td>
                  <td className="small">{r.code}<div className="muted">{r.path}</div></td>
                  <td><input value={r.title} disabled={busy} onChange={(e) => set(i, { title: e.target.value })} aria-label={`Title for ${r.code}`} />
                    {r.policy && r.policy.title !== r.fileTitle && <div className="muted small">File says: {r.fileTitle}</div>}</td>
                  <td>v{r.version}</td>
                  <td className="small">{r.stream}
                    {r.setProgram !== undefined && r.policy && r.policy.applies_to !== r.stream && (
                      <label className="check small"><input type="checkbox" checked={r.setProgram} disabled={busy} onChange={(e) => set(i, { setProgram: e.target.checked })} /> change CRM from {r.policy.applies_to} to {r.stream}</label>
                    )}</td>
                  <td className="small">{r.result ? <span className={r.result.ok ? 'badge' : 'badge bad'}>{r.result.ok ? '✓ ' : '✗ '}{r.result.text}</span> : r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={upload} disabled={busy || !chosen.length}>{busy ? `Uploading… ${done} of ${total}` : `Upload ${chosen.length} ticked file(s)`}</button>
          {skipped.length > 0 && <details className="small"><summary>Files ignored (name does not follow the library pattern)</summary><ul>{skipped.map((s) => <li key={s}>{s}</li>)}</ul></details>}
        </>
      )}
    </div>
  );
}
