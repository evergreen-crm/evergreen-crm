'use client';
// Admin: upload a policy file (PDF recommended) as a new policy or a new version.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createPolicy, publishVersion } from '@/app/policies/actions';

export default function PolicyUpload({ mode, policyId, suggestedVersion = '1.0', categories = [] }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const file = f.file.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setMsg({ bad: true, text: 'That file is over 50 MB.' }); return; }
    setBusy(true); setMsg(null);
    const path = `${policyId ?? 'new'}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
    const { error } = await createClient().storage.from('policies').upload(path, file, { contentType: file.type || undefined });
    if (error) { setBusy(false); setMsg({ bad: true, text: 'Upload failed: ' + error.message }); return; }
    const info = {
      file_path: path, file_name: file.name, file_type: file.type,
      version_label: f.version_label.value, change_note: f.change_note.value, effective_date: f.effective_date.value,
    };
    let res;
    if (mode === 'new') {
      res = await createPolicy({ ...info, title: f.title.value, code: f.code.value, category: f.category.value,
        description: f.description.value, applies_to: f.applies_to.value, require_signature: f.require_signature.checked });
    } else {
      res = await publishVersion({ ...info, policy_id: policyId });
    }
    setBusy(false);
    if (res?.error) { setMsg({ bad: true, text: res.error }); return; }
    f.reset();
    setMsg({ bad: false, text: mode === 'new' ? 'Policy added. Staff have been asked to sign it.' : 'New version published. Staff have been asked to sign it again.' });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card no-print">
      <h3>{mode === 'new' ? 'Add a policy' : 'Upload a new version'}</h3>
      {mode === 'new' && (
        <>
          <div className="row">
            <label>Title<input name="title" required placeholder="e.g., HR Policy Binder" /></label>
            <label>Document code<input name="code" placeholder="e.g., ECC-HR-POL-2026-001" /></label>
            <label>Category
              <select name="category" defaultValue="HR">{categories.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
          </div>
          <div className="row">
            <label>Applies to
              <select name="applies_to" defaultValue="Both">
                <option value="Both">MCFD & CLBC (both programs)</option>
                <option value="MCFD">MCFD only — children & youth</option>
                <option value="CLBC">CLBC only — adults</option>
              </select>
            </label>
            <label>Short description<input name="description" /></label>
          </div>
          <label className="check"><input type="checkbox" name="require_signature" defaultChecked /> Staff must read and sign it</label>
        </>
      )}
      <div className="row">
        <label>File (PDF works best — staff can read it on screen)<input type="file" name="file" required accept=".pdf,.doc,.docx" /></label>
        <label>Version<input name="version_label" required defaultValue={suggestedVersion} /></label>
        <label>Effective date<input type="date" name="effective_date" /></label>
      </div>
      <label>What changed in this version{mode === 'new' ? ' (optional)' : ''}<input name="change_note" required={mode !== 'new'} placeholder={mode === 'new' ? 'First version' : 'e.g., Updated leave section (s.6)'} /></label>
      <button disabled={busy}>{busy ? 'Uploading…' : mode === 'new' ? 'Add policy' : 'Publish new version'}</button>
      {msg && <p className={`message ${msg.bad ? '' : 'ok'}`}>{msg.text}</p>}
    </form>
  );
}
