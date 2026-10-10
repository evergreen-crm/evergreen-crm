'use client';
// Managers (level 3+) upload or replace the orientation training video.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export const VIDEO_PATH = 'orientation/video.mp4';

export default function VideoUpload({ hasVideo }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  async function onChange(e) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!/\.mp4$/i.test(f.name) && f.type !== 'video/mp4') { setMsg('Please choose an .mp4 video.'); return; }
    if (f.size > 50 * 1024 * 1024) { setMsg('That video is over 50 MB.'); return; }
    setBusy(true); setMsg(`Uploading ${(f.size / 1048576).toFixed(1)} MB — this can take a minute…`);
    const { error } = await createClient().storage.from('academy-media').upload(VIDEO_PATH, f, { upsert: true, contentType: 'video/mp4', cacheControl: '60' });
    setBusy(false);
    if (error) { setMsg(/bucket/i.test(error.message) ? 'Video storage isn’t set up yet — run supabase/academy-media.sql in Supabase.' : 'Upload failed: ' + error.message); return; }
    setMsg('✓ Video uploaded. Staff now see it on this page.');
    router.refresh();
  }

  return (
    <section className="card no-print">
      <h2>Training video (managers)</h2>
      <p className="small muted">{hasVideo ? 'A video is live on this page. Upload a new .mp4 to replace it.' : 'No video yet — staff see the narrated slides. Upload the .mp4 to show the video instead.'}</p>
      <label>{busy ? 'Uploading…' : hasVideo ? 'Replace video (.mp4, up to 50 MB)' : 'Upload video (.mp4, up to 50 MB)'}
        <input type="file" accept="video/mp4,.mp4" onChange={onChange} disabled={busy} />
      </label>
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}
