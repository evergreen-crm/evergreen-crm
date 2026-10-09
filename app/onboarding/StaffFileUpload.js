'use client';
// Upload a file for one onboarding item into the staff member's private folder.
// Photos are made smaller first (lib/compressImage.js); PDFs and Word files upload as they are.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { attachItemFile } from '@/app/onboarding/actions';
import { compressImage, fmtSize } from '@/lib/compressImage';

export default function StaffFileUpload({ itemId, profileId, hasFile }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  async function onChange(e) {
    const picked = e.target.files[0];
    if (!picked) return;
    setBusy(true); setMsg(null);
    const small = await compressImage(picked);
    const file = small.file;
    if (file.size > 25 * 1024 * 1024) { setBusy(false); setMsg('That file is over 25 MB.'); return; }
    const path = `${profileId}/${itemId}-${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
    const { error } = await createClient().storage.from('staff-files').upload(path, file, { contentType: file.type || undefined });
    if (error) { setBusy(false); setMsg('Upload failed: ' + error.message); return; }
    const res = await attachItemFile(itemId, path);
    setBusy(false);
    if (res?.error) { setMsg('Could not save: ' + res.error); return; }
    setMsg(small.saved ? `Uploaded (photo made smaller: ${fmtSize(small.before)} → ${fmtSize(small.after)}).` : 'Uploaded.'); router.refresh();
  }

  return (
    <label>{hasFile ? 'Replace file' : 'Upload file (PDF or photo)'}
      <input type="file" accept=".pdf,image/*,.doc,.docx" onChange={onChange} disabled={busy} />
      {busy && <span className="muted small">Uploading…</span>}
      {msg && <span className="small">{msg}</span>}
    </label>
  );
}
