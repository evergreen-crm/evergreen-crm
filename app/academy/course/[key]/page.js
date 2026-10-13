// Evergreen Academy — any course: training video (or narrated slides) + final quiz.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canHR, levelOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import { courseByKey } from '@/lib/courses/catalog';
import { CONTENT } from '@/lib/courses/content';
import CoursePlayer from '@/app/academy/orientation/CoursePlayer';
import VideoLesson from '@/app/academy/orientation/VideoLesson';
import { gradeCourse } from './actions';

export default async function CoursePage({ params, searchParams }) {
  const { key } = await params;
  const sp = await searchParams;
  const course = courseByKey(key);
  const content = CONTENT[key];
  if (!course || !content) notFound();
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isBoss = canHR(profile) || levelOf(profile) >= 3;

  const [{ data: mine }, { data: recent }, { data: files }] = await Promise.all([
    supabase.from('course_attempts').select('id, score, total, passed, created_at')
      .eq('profile_id', user.id).eq('course_key', key).order('created_at', { ascending: false }).limit(10),
    isBoss
      ? supabase.from('course_attempts').select('id, score, total, passed, created_at, person:profile_id(full_name)')
        .eq('course_key', key).order('created_at', { ascending: false }).limit(25)
      : Promise.resolve({ data: [] }),
    supabase.storage.from('academy-media').list(`courses/${key}`, { limit: 20, sortBy: { column: 'updated_at', order: 'desc' } }),
  ]);
  const latest = (files ?? []).find((f) => /\.mp4$/i.test(f.name));
  const { data: vid } = latest
    ? await supabase.storage.from('academy-media').createSignedUrl(`courses/${key}/${latest.name}`, 6 * 3600)
    : { data: null };
  const videoUrl = vid?.signedUrl ?? null;
  const showVideo = videoUrl && !sp?.slides;
  const best = (mine ?? []).find((a) => a.passed);
  const { data: ready } = await supabase.rpc('lesson_ready', { p_key: key });
  const grade = gradeCourse.bind(null, key);

  return (
    <main>
      <p className="small no-print"><Link href="/academy">← Evergreen Academy</Link></p>
      <div className="div-banner academy">
        <span className="div-icon">🎬</span>
        <div><h1>{course.title}</h1><p>{course.blurb} · Video and final quiz ({content.QUESTIONS.length} questions, pass {course.passPercent}%)</p></div>
      </div>

      {best && (
        <p className="message ok">✅ You passed on {fmtDate(best.created_at.slice(0, 10))} with {best.score}/{best.total}. It’s in your training record — your manager verifies it and issues the certificate.</p>
      )}

      {showVideo
        ? <VideoLesson src={videoUrl} questions={content.QUESTIONS} passPercent={course.passPercent} grade={grade}
            courseKey={key} ready={!!ready} slidesHref={`/academy/course/${key}?slides=1`} />
        : <CoursePlayer slides={content.SLIDES} questions={content.QUESTIONS} passPercent={course.passPercent} grade={grade} storeKey={`ecc-course-${key}-seen`} courseKey={key} ready={!!ready} />}
      {videoUrl && sp?.slides && <p className="small no-print"><Link href={`/academy/course/${key}`}>← Back to the video</Link></p>}
      {!videoUrl && levelOf(profile) >= 6 && <p className="muted small no-print">No video uploaded yet — staff see the narrated slides. Upload videos in <Link href="/academy/videos">Academy → Course videos</Link>.</p>}

      <p className="muted small">Based on {course.source}.</p>

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
          {(recent ?? []).length === 0 ? <p className="muted">No one has taken this quiz yet.</p> : (
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
        </section>
      )}
    </main>
  );
}
