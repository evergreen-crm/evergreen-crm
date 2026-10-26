'use client';
// The survey questions: big tap-friendly buttons (1–5, or yes / no), a comments box, and Send.
import { useState } from 'react';
import { SURVEYS, SCALE } from '@/lib/surveys';
import { submitSurvey } from '@/app/f/survey/actions';

export default function SurveyForm({ token, surveyKey }) {
  const def = SURVEYS[surveyKey];
  const [answers, setAnswers] = useState({});
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);
  const set = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));

  async function send() {
    setBusy(true); setMsg(null);
    const r = await submitSurvey(token, answers, comments);
    setBusy(false);
    if (r?.error) { setMsg(r.error); return; }
    setDone(true);
  }
  if (done) return <div className="card if-done"><h2>✓ Thank you!</h2><p>Your answers were received. They help us make Evergreen better.</p></div>;
  return (
    <div className="card survey">
      {def.questions.map((q, i) => (
        <fieldset key={q.id} className="survey-q">
          <legend><strong>{i + 1}.</strong> {q.text}</legend>
          <div className="survey-opts" role="radiogroup">
            {q.yesno
              ? [['yes', 'Yes'], ['no', 'No']].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={answers[q.id] === v} className={answers[q.id] === v ? 'on' : ''} onClick={() => set(q.id, v)}>{l}</button>)
              : SCALE.map((l, n) => <button key={n} type="button" role="radio" aria-checked={answers[q.id] === n + 1} className={answers[q.id] === n + 1 ? 'on' : ''} onClick={() => set(q.id, n + 1)} title={l}><strong>{n + 1}</strong><span>{l}</span></button>)}
          </div>
        </fieldset>
      ))}
      <label>Anything else you want to tell us? (optional)<textarea rows={4} value={comments} maxLength={3000} onChange={(e) => setComments(e.target.value)} /></label>
      <button type="button" className="big-install" onClick={send} disabled={busy || !Object.keys(answers).length}>{busy ? 'Sending…' : 'Send my answers'}</button>
      {msg && <p className="message error">{msg}</p>}
    </div>
  );
}
