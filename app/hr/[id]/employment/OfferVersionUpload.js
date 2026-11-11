'use client';
// Upload your own offer letter file (PDF or Word) for this person. Every upload is kept as a new version;
// nothing is replaced. Uses lib/uploadRules.js: a zip with one file is unpacked, max 10 MB.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { prepareOne, contentTypeFor, MAX_LABEL } from '@/lib/uploadRules';
import { recordOfferUpload } from './actions';

export default function OfferVersionUpload({ profileId, nextVersion }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();
  async function onChange(e) {
    const picked = e.target.files[0]; e.target.value = '';
    if (!picked) return;
    setBusy(true); setMsg(null);
    const ready = await prepareOne(picked);
    if (ready.error) { setBusy(false); setMsg({ bad: true, text: ready.error }); return; }
    const f = ready.file;
    if (!/\.(pdf|docx?)$/i.test(f.name)) { setBusy(false); setMsg({ bad: true, text: 'Please upload a PDF or Word file.' }); return; }
    const path = `${profileId}/paperwork/offers/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_').slice(-80)}`;
    const { error } = await createClient().storage.from('staff-files').upload(path, f, { upsert: false, contentType: contentTypeFor(f) });
    if (error) { setBusy(false); setMsg({ bad: true, text: 'Upload failed: ' + error.message }); return; }
    const res = await recordOfferUpload({ profileId, path, name: f.name, size: f.size, note });
    setBusy(false);
    if (res?.error) { setMsg({ bad: true, text: res.error }); return; }
    setNote('');
    setMsg({ bad: false, text: `✓ Saved as version ${res.version}.` });
    router.refresh();
  }
  return (
    <div className="no-print">
      <label>Note for this version (optional)
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Updated wage · Signed copy scanned" disabled={busy} />
      </label>
      <label>{busy ? 'Uploading…' : `📎 Upload version ${nextVersion} (PDF or Word, max ${MAX_LABEL})`}
        <input type="file" accept=".pdf,.doc,.docx,.zip" onChange={onChange} disabled={busy} style={{ padding: 4 }} />
      </label>
      {msg && <p className={`message small ${msg.bad ? '' : 'ok'}`}>{msg.text}</p>}
    </div>
  );
}
