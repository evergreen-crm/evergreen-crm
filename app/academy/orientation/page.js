// Evergreen Academy — New Staff Orientation: narrated lesson ("video") + final quiz.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { canHR, levelOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import { COURSE, SLIDES, QUESTIONS } from '@/lib/courses/orientation';
import CoursePlayer from './CoursePlayer';
import VideoLesson from './VideoLesson';
import VideoUpload from './VideoUpload';

export default async function OrientationCourse({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isBoss = canHR(profile) || levelOf(profile) >= 3;

  const [{ data: mine }, { data: recent }] = await Promise.all([
    supabase.from('course_attempts').select('id, score, total, passed, created_at')
      .eq('profile_id', user.id).eq('course_key', COURSE.key).order('created_at', { ascending: false }).limit(10),
    isBoss
      ? supabase.from('course_attempts').select('id, score, total, passed, created_at, person:profile_id(full_name)')
        .eq('course_key', COURSE.key).order('created_at', { ascending: false }).limit(25)
      : Promise.resolve({ data: [] }),
  ]);
  const best = (mine ?? []).find((a) => a.passed);
  const canUpload = levelOf(profile) >= 3;
  // The training video lives in private storage; a signed link lets the browser stream it.
  // Use the newest .mp4 in the orientation folder (uploaded here, or straight into Supabase Storage).
  const { data: files } = await supabase.storage.from('academy-media').list('orientation', { limit: 50, sortBy: { column: 'updated_at', order: 'desc' } });
  const latest = (files ?? []).find((f) => /\.mp4$/i.test(f.name));
  const { data: vid } = latest
    ? await supabase.storage.from('academy-media').createSignedUrl(`orientation/${latest.name}`, 6 * 3600)
    : { data: null };
  const videoUrl = vid?.signedUrl ?? null;
  const showVideo = videoUrl && !sp?.slides;

  return (
    <main>
      <p className="small no-print"><Link href="/academy">← Evergreen Academy</Link></p>
      <div className="div-banner academy">
        <span className="div-icon">🎬</span>
        <div><h1>{COURSE.title}</h1><p>Training video (about 11 minutes, with captions) and final quiz ({QUESTIONS.length} questions, pass {COURSE.passPercent}%)</p></div>
      </div>

      {best && (
        <p className="message ok">✅ You passed on {fmtDate(best.created_at.slice(0, 10))} with {best.score}/{best.total}. It’s in your training record — your manager verifies it and issues the certificate.</p>
      )}

      {showVideo
        ? <VideoLesson src={videoUrl} questions={QUESTIONS} passPercent={COURSE.passPercent} />
        : <CoursePlayer slides={SLIDES} questions={QUESTIONS} passPercent={COURSE.passPercent} />}
      {videoUrl && sp?.slides && <p className="small no-print"><Link href="/academy/orientation">← Back to the video</Link></p>}

      <p className="muted small">Based on the {COURSE.source}. This course is an introduction — it does not replace reading the manual and your in-person orientation with your Program Coordinator.</p>

      {canUpload && <VideoUpload hasVideo={!!videoUrl} />}

      {(mine ?? []).length > 0 && (
        <section className="card">
          <h2>My attempts</h2>
          <table>
            <thead><tr><th>Date</th><th>Score</th><th>Result</th></tr></thead>
            <tbody>
              {mine.map((a) => (
                <tr key={a.id}><td>{fmtDate(a.created_at.slice(0, 10))}</td><td>{a.score}/{a.total} ({Math.round((a.score / a.total) * 100)}%)</td>
                  <td>{a.passed ? <span className="badge">Passed</span> : <span className="badge warn">Try again</span>}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {isBoss && (
        <section className="card">
          <h2>Team results</h2>
          {(recent ?? []).length === 0 ? <p className="muted">No one has taken the quiz yet.</p> : (
            <table>
              <thead><tr><th>Staff</th><th>Date</th><th>Score</th><th>Result</th></tr></thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id}><td>{a.person?.full_name ?? '—'}</td><td>{fmtDate(a.created_at.slice(0, 10))}</td><td>{a.score}/{a.total}</td>
                    <td>{a.passed ? <span className="badge">Passed</span> : <span className="badge warn">Not passed</span>}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">Passes appear in Academy → Team compliance for you to verify.</p>
        </section>
      )}
    </main>
  );
}
