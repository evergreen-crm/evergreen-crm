'use client';
// Take or choose a head-and-shoulders photo. It is shrunk on the phone (about 100 KB) before upload.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { submitIdPhoto } from '@/app/id/actions';

async function shrink(file, max = 640) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82));
}

export default function IdPhotoUpload({ profileId, label = 'Take or choose photo' }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  async function onChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true); setMsg(null);
    let blob = file;
    try { blob = await shrink(file); } catch { /* some formats can't be read in the browser — upload as is */ }
    if (blob.size > 5 * 1024 * 1024) { setBusy(false); setMsg('That photo is too large. Please try another.'); return; }
    const path = `${profileId}/${crypto.randomUUID()}.jpg`;
    const { error } = await createClient().storage.from('id-photos').upload(path, blob, { contentType: blob.type || 'image/jpeg' });
    if (error) { setBusy(false); setMsg('Upload failed: ' + error.message); return; }
    const res = await submitIdPhoto(path);
    setBusy(false);
    if (res?.error) { setMsg('Could not save: ' + res.error); return; }
    setMsg('Sent to your manager for approval.'); router.refresh();
  }

  return (
    <label className="photo-pick">
      <span className="button">{busy ? 'Uploading…' : label}</span>
      <input type="file" accept="image/*" capture="user" onChange={onChange} disabled={busy} hidden />
      {msg && <span className="small">{msg}</span>}
    </label>
  );
}
