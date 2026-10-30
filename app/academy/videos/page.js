// Evergreen Academy — level 6-8 (CSO, CEO, Administrator) upload all course videos in one go.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { COURSES } from '@/lib/courses/catalog';
import BulkUpload from './BulkUpload';
import { saveVideoLink } from './actions';

export default async function CourseVideos({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (levelOf(profile) < 6) redirect('/academy');   // CSO, CEO and Administrator only
  const lists = await Promise.all([
    supabase.storage.from('academy-media').list('orientation', { limit: 20 }),
    ...COURSES.map((c) => supabase.storage.from('academy-media').list(`courses/${c.key}`, { limit: 20 })),
  ]);
  const { data: linkRows } = await supabase.from('training_videos').select('course_key, url');
  const linkOf = Object.fromEntries((linkRows ?? []).map((r) => [r.course_key, r.url]));
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
      <section className="card" id="links">
        <h2>OneDrive links (free storage)</h2>
        <p className="small">Keep the videos in Evergreen’s OneDrive instead of uploading them here. In OneDrive: right-click the video → Share → set “Anyone with the link can view” → Copy link, then paste it below. A link is used instead of an uploaded video. Leave the box empty and save to remove a link.</p>
        {sp.ok && <p className="message">{sp.ok}</p>}
        {sp.error && <p className="alert">{sp.error}</p>}
        {rows.map((r) => (
          <form key={r.key} action={saveVideoLink} className="row" style={{ alignItems: 'flex-end', marginBottom: 8 }}>
            <input type="hidden" name="course_key" value={r.key} />
            <label style={{ flex: '1 1 420px' }}>{r.title}
              <input name="url" type="url" defaultValue={linkOf[r.key] ?? ''} placeholder="https://…sharepoint.com/…" />
            </label>
            <button type="submit" className="secondary">Save link</button>
          </form>
        ))}
      </section>
      <h2>Or upload the video files here</h2>
      <BulkUpload courses={COURSES} />
      <section className="card">
        <h2>Status</h2>
        <table>
          <thead><tr><th>Course</th><th>File name to use</th><th>Video</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.key}><td><Link href={r.href}>{r.title}</Link></td><td className="small"><code>{r.key}.mp4</code></td>
              <td>{linkOf[r.key] ? <span className="badge">OneDrive link</span> : r.ok ? <span className="badge">Uploaded</span> : <span className="badge warn">Slides only</span>}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </main>
  );
}
