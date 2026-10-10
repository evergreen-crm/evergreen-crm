'use client';
// Final quiz. Answers are checked on the server; the right answers are only shown after you submit.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { gradeOrientation } from './actions';

export default function Quiz({ questions, passPercent, onReview }) {
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
    const r = await gradeOrientation(answers);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setRes(r); router.refresh();
    window.scrollTo({ top: document.getElementById('quiz-top')?.offsetTop ?? 0, behavior: 'smooth' });
  }

  function retry() { setAnswers({}); setRes(null); setErr(null); }

  return (
    <section className="card" id="quiz-top">
      <h2>Final quiz</h2>
      {res && (
        <div className={`message ${res.passed ? 'ok' : ''}`}>
          <strong>{res.passed ? '🎉 Passed!' : 'Not passed yet'}</strong> — you scored {res.score}/{res.total} ({res.percent}%). Pass mark is {passPercent}%.
          {res.passed && (res.recorded ? ' The course has been added to your training record for your manager to verify.' : ' (Your training record could not be updated — please tell your manager.)')}
          {!res.passed && ' Review the answers below, watch the lesson again, and try once more.'}
        </div>
      )}
      <form onSubmit={submit}>
        {questions.map((q, n) => {
          const r = byId[q.id];
          return (
            <fieldset key={q.id} className="quiz-q" disabled={!!res}>
              <legend><strong>{n + 1}.</strong> {q.q}</legend>
              {q.options.map((o, k) => {
                const mark = r ? (k === r.correct ? 'right' : k === r.chose ? 'wrong' : '') : '';
                return (
                  <label key={k} className={`quiz-opt ${mark}`}>
                    <input type="radio" name={q.id} checked={answers[q.id] === k} onChange={() => setAnswers((a) => ({ ...a, [q.id]: k }))} />
                    <span>{o}{mark === 'right' ? ' ✓' : mark === 'wrong' ? ' ✗' : ''}</span>
                  </label>
                );
              })}
              {r && <p className={`small ${r.ok ? 'muted' : ''}`} style={{ margin: '6px 0 0' }}>{r.ok ? '✓ Correct. ' : '✗ '}{r.why}</p>}
            </fieldset>
          );
        })}
        {err && <p className="message">{err}</p>}
        {!res ? (
          <button disabled={busy}>{busy ? 'Checking…' : `Submit answers${left ? ` (${left} left)` : ''}`}</button>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            {!res.passed && <button type="button" onClick={retry}>Try the quiz again</button>}
            <button type="button" className="secondary" onClick={onReview}>Watch the lesson again</button>
          </div>
        )}
      </form>
    </section>
  );
}
