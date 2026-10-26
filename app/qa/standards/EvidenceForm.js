'use client';
// Attach evidence to a standard: a CRM link (e.g. /policies) or a file (10 MB, zips unpacked; lib/uploadRules.js).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { prepareOne, contentTypeFor, MAX_LABEL } from '@/lib/uploadRules';
import { addEvidence } from './actions';

export default function EvidenceForm({ standardId, suggestions = [] }) {
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();
  async function save(e) {
    e.preventDefault();
    const picked = e.currentTarget.file.files?.[0];
    setBusy(true); setMsg(null);
    let file_path = null, file_name = null;
    if (picked) {
      const ready = await prepareOne(picked);
      if (ready.error) { setBusy(false); setMsg(ready.error); return; }
      file_name = ready.file.name;
      file_path = `${standardId}/${crypto.randomUUID()}-${file_name.replace(/[^\w.\-]+/g, '_')}`;
      const { error } = await createClient().storage.from('qa-evidence').upload(file_path, ready.file, { contentType: contentTypeFor(ready.file) });
      if (error) { setBusy(false); setMsg('Upload failed: ' + error.message); return; }
    }
    const r = await addEvidence({ standard_id: standardId, title: title || file_name, link, file_path, file_name });
    setBusy(false);
    if (r?.error) { setMsg(r.error); return; }
    setTitle(''); setLink(''); e.target.reset?.(); router.refresh();
  }
  return (
    <form onSubmit={save} className="qa-evidence-form no-print">
      <div className="row">
        <label>Evidence<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="e.g. Q3 incident trend review" /></label>
        <label>Link (CRM page or web)<input value={link} onChange={(e) => setLink(e.target.value)} list={`sug-${standardId}`} placeholder="/qa/incidents" /></label>
        <label>or a file (max {MAX_LABEL})<input type="file" name="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*,.zip" /></label>
      </div>
      <datalist id={`sug-${standardId}`}>{suggestions.map((s) => <option key={s.href} value={s.href}>{s.label}</option>)}</datalist>
      <button disabled={busy}>{busy ? 'Saving…' : '+ Add evidence'}</button>
      {msg && <p className="message error small">{msg}</p>}
    </form>
  );
}
