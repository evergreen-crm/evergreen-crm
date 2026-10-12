'use client';
// Upload many course videos at once. Each file is matched to a course by its name (e.g. "privacy.mp4").
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function BulkUpload({ courses }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function match(name) {
    const base = name.toLowerCase().replace(/\.mp4$/, '');
    if (base.includes('orientation')) return { key: 'orientation', path: 'orientation/video.mp4', title: 'New Staff Orientation' };
    const c = [...courses].sort((a, b) => b.key.length - a.key.length).find((x) => base.includes(x.key));
    return c ? { key: c.key, path: `courses/${c.key}/video.mp4`, title: c.title } : null;
  }

  async function onChange(e) {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    const list = files.map((f) => ({ f, m: match(f.name), status: 'Waiting…' }));
    setRows(list.map((r) => ({ name: r.f.name, title: r.m?.title ?? '—', status: r.m ? 'Waiting…' : 'Skipped: name doesn’t match a course' })));
    setBusy(true);
    const supabase = createClient();
    for (let i = 0; i < list.length; i++) {
      const { f, m } = list[i];
      if (!m) continue;
      if (f.size > 50 * 1024 * 1024) { setRows((r) => r.map((x, j) => (j === i ? { ...x, status: 'Too big (over 50 MB)' } : x))); continue; }
      setRows((r) => r.map((x, j) => (j === i ? { ...x, status: `Uploading ${(f.size / 1048576).toFixed(1)} MB…` } : x)));
      const { error } = await supabase.storage.from('academy-media').upload(m.path, f, { upsert: true, contentType: 'video/mp4', cacheControl: '60' });
      setRows((r) => r.map((x, j) => (j === i ? { ...x, status: error ? 'Failed: ' + error.message : '✓ Uploaded' } : x)));
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="card">
      <label>{busy ? 'Uploading…' : 'Choose videos (.mp4) — you can select several at once'}
        <input type="file" accept="video/mp4,.mp4" multiple onChange={onChange} disabled={busy} />
      </label>
      {rows.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>File</th><th>Course</th><th>Status</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.name}><td className="small">{r.name}</td><td className="small">{r.title}</td><td className="small">{r.status}</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
}
