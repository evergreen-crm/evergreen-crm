// Evergreen Academy — level 6-8 (CSO, CEO, Administrator) upload all course videos in one go.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { COURSES } from '@/lib/courses/catalog';
import BulkUpload from './BulkUpload';

export default async function CourseVideos() {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (levelOf(profile) < 6) redirect('/academy');   // CSO, CEO and Administrator only
  const lists = await Promise.all([
    supabase.storage.from('academy-media').list('orientation', { limit: 20 }),
    ...COURSES.map((c) => supabase.storage.from('academy-media').list(`courses/${c.key}`, { limit: 20 })),
  ]);
  const has = (i) => (lists[i]?.data ?? []).some((f) => /\.mp4$/i.test(f.name));
  const rows = [{ key: 'orientation', title: 'New Staff Orientation', href: '/academy/orientation', ok: has(0) },
    ...COURSES.map((c, i) => ({ key: c.key, title: c.title, href: `/academy/course/${c.key}`, ok: has(i + 1) }))];

  return (
    <main>
      <p className="small"><Link href="/academy">← Evergreen Academy</Link></p>
      <div className="div-banner academy">
        <span className="div-icon">🎞️</span>
        <div><h1>Course videos</h1><p>Upload or replace the training videos for every Academy course</p></div>
      </div>
      <p>Select all the videos at once. Each file is matched to its course by its name — for example <code>privacy.mp4</code> goes to “Privacy and FOIPPA”. Uploading again replaces the old video. Staff must watch the whole video before the quiz opens — the required viewing time is set from each video’s length automatically.</p>
      <BulkUpload courses={COURSES} />
      <section className="card">
        <h2>Status</h2>
        <table>
          <thead><tr><th>Course</th><th>File name to use</th><th>Video</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.key}><td><Link href={r.href}>{r.title}</Link></td><td className="small"><code>{r.key}.mp4</code></td>
              <td>{r.ok ? <span className="badge">Live</span> : <span className="badge warn">Slides only</span>}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </main>
  );
}
