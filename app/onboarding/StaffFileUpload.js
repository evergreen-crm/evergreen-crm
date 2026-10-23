'use client';
// Upload a file for one onboarding item into the staff member's private folder.
// Uses lib/uploadRules.js: a zip with one file is unpacked, photos are made smaller, max 10 MB.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { attachItemFile } from '@/app/onboarding/actions';
import { prepareOne, contentTypeFor, MAX_LABEL } from '@/lib/uploadRules';

export default function StaffFileUpload({ itemId, profileId, hasFile }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  async function onChange(e) {
    const picked = e.target.files[0];
    if (!picked) return;
    setBusy(true); setMsg(null);
    e.target.value = '';
    const ready = await prepareOne(picked);
    if (ready.error) { setBusy(false); setMsg(ready.error); return; }
    const file = ready.file;
    const path = `${profileId}/${itemId}-${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
    const { error } = await createClient().storage.from('staff-files').upload(path, file, { contentType: contentTypeFor(file) });
    if (error) { setBusy(false); setMsg('Upload failed: ' + error.message); return; }
    const res = await attachItemFile(itemId, path);
    setBusy(false);
    if (res?.error) { setMsg('Could not save: ' + res.error); return; }
    setMsg('Uploaded.' + ready.note); router.refresh();
  }

  return (
    <label>{hasFile ? 'Replace file' : `Upload file (PDF or photo, max ${MAX_LABEL})`}
      <input type="file" accept=".pdf,image/*,.doc,.docx,.zip" onChange={onChange} disabled={busy} />
      {busy && <span className="muted small">Uploading…</span>}
      {msg && <span className="small">{msg}</span>}
    </label>
  );
}
