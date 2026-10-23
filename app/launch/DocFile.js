'use client';
// Upload the actual file for one pre-opening document (private "launch-files" storage).
// Photos are made smaller first. Uploading moves "Not started"/"Drafting" to "Ready for approval".
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { prepareOne, contentTypeFor } from '@/lib/uploadRules';
import { attachLaunchFile } from '@/app/launch/actions';
import { plainError } from '@/lib/plain';


export default function DocFile({ planId, docId, fileName, fileUrl }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  async function onChange(e) {
    const picked = e.target.files[0];
    e.target.value = '';
    if (!picked) return;
    setBusy(true); setMsg(null);
    const ready = await prepareOne(picked);
    if (ready.error) { setBusy(false); setMsg(ready.error); return; }
    const file = ready.file;
    const path = `${planId}/${docId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
    const { error } = await createClient().storage.from('launch-files').upload(path, file, { contentType: contentTypeFor(file) });
    if (error) {
      setBusy(false);
      setMsg(/bucket/i.test(error.message) ? 'File storage isn’t switched on yet. Please tell the office (setup file: launch-files.sql).' : plainError('Upload failed: ' + error.message));
      return;
    }
    const res = await attachLaunchFile({ id: docId, plan_id: planId, path, name: file.name });
    setBusy(false);
    if (res?.error) { setMsg('Could not save: ' + res.error); return; }
    setMsg('Uploaded.' + ready.note);
    router.refresh();
  }

  return (
    <div className="small" style={{ marginBottom: 6 }}>
      {fileUrl && <div><a href={fileUrl} target="_blank" rel="noreferrer">📎 {fileName ?? 'Open file'}</a></div>}
      <label className="no-print" style={{ margin: '4px 0 0' }}>
        {busy ? 'Uploading…' : fileName ? 'Replace file' : '⬆ Upload file'}
        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*,.zip" onChange={onChange} disabled={busy} style={{ padding: 6 }} />
      </label>
      {msg && <div>{msg}</div>}
    </div>
  );
}
