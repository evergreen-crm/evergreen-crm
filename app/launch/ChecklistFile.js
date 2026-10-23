'use client';
// Attach evidence (photo, PDF, Word, Excel) to one House checklist item. Stored in the private "launch-files" bucket.
// Uses lib/uploadRules.js: a zip with one file is unpacked, photos are made smaller, max 10 MB.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { prepareOne, contentTypeFor } from '@/lib/uploadRules';
import { attachChecklistFile } from '@/app/launch/actions';

export default function ChecklistFile({ planId, itemId, fileName, fileUrl }) {
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
    const path = `${planId}/checklist/${itemId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
    const { error } = await createClient().storage.from('launch-files').upload(path, file, { contentType: contentTypeFor(file) });
    if (error) { setBusy(false); setMsg('Upload failed: ' + error.message); return; }
    const res = await attachChecklistFile({ id: itemId, plan_id: planId, path, name: file.name });
    setBusy(false);
    if (res?.error) { setMsg('Could not save: ' + res.error); return; }
    router.refresh();
  }

  return (
    <div className="small">
      {fileUrl && <div><a href={fileUrl} target="_blank" rel="noreferrer">📎 {fileName ?? 'Evidence'}</a></div>}
      <label className="no-print" style={{ margin: '2px 0 0', fontWeight: 400 }}>
        {busy ? 'Uploading…' : fileName ? 'Replace evidence' : '📎 Add evidence'}
        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*,.zip" onChange={onChange} disabled={busy} style={{ padding: 4 }} />
      </label>
      {msg && <div>{msg}</div>}
    </div>
  );
}
