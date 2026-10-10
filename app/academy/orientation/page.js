// Evergreen Academy — New Staff Orientation: narrated lesson ("video") + final quiz.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { canHR, levelOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import { COURSE, SLIDES, QUESTIONS } from '@/lib/courses/orientation';
import CoursePlayer from './CoursePlayer';

export default async function OrientationCourse() {
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

  return (
    <main>
      <p className="small no-print"><Link href="/academy">← Evergreen Academy</Link></p>
      <div className="div-banner academy">
        <span className="div-icon">🎬</span>
        <div><h1>{COURSE.title}</h1><p>Training video ({SLIDES.length} parts, about 7 minutes) and final quiz ({QUESTIONS.length} questions, pass {COURSE.passPercent}%)</p></div>
      </div>

      {best && (
        <p className="message ok">✅ You passed on {fmtDate(best.created_at.slice(0, 10))} with {best.score}/{best.total}. It’s in your training record — your manager verifies it and issues the certificate.</p>
      )}

      <CoursePlayer slides={SLIDES} questions={QUESTIONS} passPercent={COURSE.passPercent} />

      <p className="muted small">Based on the {COURSE.source}. This course is an introduction — it does not replace reading the manual and your in-person orientation with your Program Coordinator.</p>

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
