'use client';
// Final quiz. Graded inside the database. A pass shows the right answers; a fail only shows which ones were wrong,
// and another try needs a fresh, full viewing of the lesson.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { gradeOrientation } from './actions';

export default function Quiz({ questions, passPercent, grade }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [res, setRes] = useState(null);
  const router = useRouter();
  const left = questions.filter((q) => answers[q.id] === undefined).length;
  const byId = Object.fromEntries((res?.results ?? []).map((r) => [r.id, r]));

  async function submit(e) {
    e.preventDefault();
    if (left) { setErr(`Please answer all questions — ${left} left.`); return; }
    setBusy(true); setErr(null);
    const r = await (grade ?? gradeOrientation)(answers);
    setBusy(false);
    if (r?.error) { setErr(r.error); if (r.needWatch) setRes({ needWatch: true }); return; }
    setRes(r); router.refresh();
    window.scrollTo({ top: document.getElementById('quiz-top')?.offsetTop ?? 0, behavior: 'smooth' });
  }

  const rewatch = () => { window.scrollTo({ top: 0 }); window.location.reload(); };

  return (
    <section className="card" id="quiz-top">
      <h2>Final quiz</h2>
      {res && !res.needWatch && (
        <div className={`message ${res.passed ? 'ok' : ''}`}>
          <strong>{res.passed ? '🎉 Passed!' : 'Not passed yet'}</strong> — you scored {res.score}/{res.total} ({res.percent}%). Pass mark is {passPercent}%.
          {res.passed && (res.recorded ? ' The course has been added to your training record for your manager to verify.' : ' (Your training record could not be updated — please tell your manager.)')}
          {res.passed && res.recorded && (res.expires_on
            ? <> <strong>Renew by {res.expires_on}</strong> (every {res.renew_months === 12 ? 'year' : `${res.renew_months / 12} years`}, per the training standard) — you’ll be reminded before it’s due.</>
            : ' No renewal needed for this course.')}
          {!res.passed && ' The questions you got wrong are marked ✗. Watch the whole lesson again, then try once more.'}
        </div>
      )}
      <form onSubmit={submit}>
        {questions.map((q, n) => {
          const r = byId[q.id];
          return (
            <fieldset key={q.id} className="quiz-q" disabled={!!res}>
              <legend><strong>{n + 1}.</strong> {q.q}</legend>
              {q.options.map((o, k) => {
                const mark = !r ? '' : r.correct !== undefined && k === r.correct ? 'right' : k === r.chose ? (r.ok ? 'right' : 'wrong') : '';
                return (
                  <label key={k} className={`quiz-opt ${mark}`}>
                    <input type="radio" name={q.id} checked={answers[q.id] === k} onChange={() => setAnswers((a) => ({ ...a, [q.id]: k }))} />
                    <span>{o}{mark === 'right' ? ' ✓' : mark === 'wrong' ? ' ✗' : ''}</span>
                  </label>
                );
              })}
              {r?.why && <p className={`small ${r.ok ? 'muted' : ''}`} style={{ margin: '6px 0 0' }}>{r.ok ? '✓ Correct. ' : '✗ '}{r.why}</p>}
            </fieldset>
          );
        })}
        {err && <p className="message">{err}</p>}
        {!res ? (
          <button disabled={busy}>{busy ? 'Checking…' : `Submit answers${left ? ` (${left} left)` : ''}`}</button>
        ) : !res.passed && (
          <button type="button" onClick={rewatch}>Watch the lesson again</button>
        )}
      </form>
    </section>
  );
}
