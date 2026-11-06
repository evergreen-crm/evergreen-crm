// Evergreen Academy — course videos, Admin only. Each course keeps every version of its video:
// upload a file or paste a OneDrive link to add the next version; switch back to an older one at any time.
// Staff always see the current version, and each quiz attempt records which version was watched.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { COURSES } from '@/lib/courses/catalog';
import { fmtDate } from '@/lib/options';
import VersionUpload from './VersionUpload';
import { addLinkVersion, useVersion } from './actions';

const mb = (b) => (b ? `${(b / 1048576).toFixed(1)} MB` : '');
const len = (s) => (s ? `${Math.round(s / 60)} min` : 'length not set');

export default async function CourseVideos({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (profile.role !== 'admin') redirect('/academy');   // Admin only
  const { data: versions } = await supabase.from('course_video_versions')
    .select('id, course_key, version_no, source, url, file_name, size_bytes, seconds, notes, is_current, uploaded_at, who:uploaded_by(full_name)')
    .order('version_no', { ascending: false });
  const byKey = {};
  for (const v of versions ?? []) (byKey[v.course_key] ??= []).push(v);
  const rows = [{ key: 'orientation', title: 'Evergreen New Staff Orientation', href: '/academy/orientation' },
    ...COURSES.map((c) => ({ key: c.key, title: c.title, href: `/academy/course/${c.key}` }))];
  const withVideo = rows.filter((r) => (byKey[r.key] ?? []).some((v) => v.is_current)).length;

  return (
    <main>
      <p className="small"><Link href="/academy">← Evergreen Academy</Link></p>
      <div className="div-banner academy">
        <span className="div-icon">🎞️</span>
        <div><h1>Course videos</h1><p>Admin only · {withVideo} of {rows.length} courses have a video · every version is kept</p></div>
      </div>
      <p className="small">Each course has its own space. Upload a new video, or paste a OneDrive link, and it becomes the next version (v1, v2, v3…) — staff see it straight away. Older versions are kept: press <strong>Use this version</strong> to go back. Staff must watch the whole video before the quiz opens; the watching time follows the current version’s length. Courses with no video show narrated slides.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="alert">{sp.error}</p>}

      {rows.map((r) => {
        const list = byKey[r.key] ?? [];
        const cur = list.find((v) => v.is_current);
        return (
          <section key={r.key} id={`c-${r.key}`} className="card">
            <h2 style={{ marginBottom: 4 }}><Link href={r.href}>{r.title}</Link></h2>
            <p className="small" style={{ marginTop: 0 }}>
              {cur
                ? <><span className="badge">Staff see v{cur.version_no}</span> {cur.source === 'link' ? 'OneDrive link' : cur.file_name} · {len(cur.seconds)} · added {fmtDate(cur.uploaded_at.slice(0, 10))}</>
                : <span className="badge warn">No video yet: narrated slides</span>}
            </p>
            <VersionUpload courseKey={r.key} />
            <details style={{ marginTop: 8 }}>
              <summary className="small">Or add a OneDrive link as the new version</summary>
              <p className="small muted">In OneDrive: right-click the video → Share → “Anyone with the link can view” → Copy link. Type the video’s length so the CRM knows how long staff must watch.</p>
              <form action={addLinkVersion} className="row" style={{ alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <input type="hidden" name="course_key" value={r.key} />
                <label style={{ flex: '3 1 300px' }}>OneDrive link<input name="url" type="url" required placeholder="https://…sharepoint.com/…" /></label>
                <label style={{ flex: '0 1 120px' }}>Length (minutes)<input name="minutes" type="number" min="1" max="300" step="1" /></label>
                <label style={{ flex: '2 1 200px' }}>What changed (optional)<input name="notes" maxLength={500} /></label>
                <button type="submit" className="secondary">Save link as new version</button>
              </form>
            </details>
            {list.length > 0 && (
              <table className="small" style={{ marginTop: 10 }}>
                <thead><tr><th>Version</th><th>Video</th><th>Added</th><th>What changed</th><th></th></tr></thead>
                <tbody>{list.map((v) => (
                  <tr key={v.id}>
                    <td><strong>v{v.version_no}</strong></td>
                    <td>{v.source === 'link' ? <a href={v.url} target="_blank" rel="noreferrer">OneDrive link</a> : v.file_name} <span className="muted">{[mb(v.size_bytes), len(v.seconds)].filter(Boolean).join(' · ')}</span></td>
                    <td>{fmtDate(v.uploaded_at.slice(0, 10))}{v.who?.full_name ? ` · ${v.who.full_name}` : ''}</td>
                    <td>{v.notes ?? ''}</td>
                    <td>{v.is_current ? <span className="badge">Current</span> : (
                      <form action={useVersion}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="course_key" value={r.key} />
                        <button type="submit" className="secondary">Use this version</button></form>)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
        );
      })}
    </main>
  );
}
