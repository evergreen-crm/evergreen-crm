'use client';
// Upload a new version of one course's video. The file goes to storage under a new name (old versions are kept),
// then it is registered as the next version and becomes the one staff see.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { videoSeconds } from '../videoSeconds';
import { registerUpload } from './actions';

const MAX_MB = 50;

export default function VersionUpload({ courseKey }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = form.file.files?.[0];
    if (!f) { setMsg('Choose an .mp4 video first.'); return; }
    if (!/\.mp4$/i.test(f.name)) { setMsg('The video must be an .mp4 file.'); return; }
    if (f.size > MAX_MB * 1048576) { setMsg(`This file is ${(f.size / 1048576).toFixed(0)} MB. Uploads here are up to ${MAX_MB} MB — for a bigger video, use a OneDrive link below.`); return; }
    setBusy(true);
    setMsg(`Uploading ${(f.size / 1048576).toFixed(1)} MB…`);
    const folder = courseKey === 'orientation' ? 'orientation' : `courses/${courseKey}`;
    const path = `${folder}/v-${Date.now()}.mp4`;
    const { error } = await createClient().storage.from('academy-media').upload(path, f, { upsert: false, contentType: 'video/mp4', cacheControl: '3600' });
    if (error) { setBusy(false); setMsg('Upload failed: ' + error.message); return; }
    const seconds = await videoSeconds(f);
    const r = await registerUpload({ key: courseKey, path, fileName: f.name, size: f.size, seconds, notes: form.notes.value });
    setBusy(false);
    if (r?.error) { setMsg('Uploaded, but could not save the version: ' + r.error); return; }
    form.reset();
    setMsg(`✓ Saved as version ${r.version}${seconds ? ` · ${Math.round(seconds / 60)} min — staff must watch it in full` : ''}. Staff now see this video.`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="row" style={{ alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
      <label style={{ flex: '1 1 220px' }}>New video (.mp4, up to {MAX_MB} MB)
        <input name="file" type="file" accept="video/mp4,.mp4" disabled={busy} />
      </label>
      <label style={{ flex: '2 1 260px' }}>What changed (optional)
        <input name="notes" maxLength={500} placeholder="e.g. New intro, updated phone numbers" disabled={busy} />
      </label>
      <button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload as new version'}</button>
      {msg && <p className="small" style={{ flexBasis: '100%', margin: 0 }} role="status">{msg}</p>}
    </form>
  );
}
