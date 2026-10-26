'use client';
// 🤖 Ask Evergreen: type a question, get a short answer with the policy and page it came from.
import { useState } from 'react';
import Link from 'next/link';
import { askQuestion, rateAnswer } from './actions';

const EXAMPLES = [
  'What do I do if a youth doesn’t come home?',
  'How long do I have to write an incident report?',
  'A youth refuses their medication. What do I do?',
  'What is the dress code?',
  'How do I swap a shift?',
  'Can I give a youth a ride in my own car?',
];

function Answer({ text }) {
  // Show [2] as a small link to source 2.
  return text.split(/\n+/).map((line, i) => (
    <p key={i} style={{ margin: '6px 0' }}>
      {line.split(/(\[\d{1,2}\])/g).map((part, j) => {
        const m = part.match(/^\[(\d{1,2})\]$/);
        return m ? <a key={j} href={`#src-${m[1]}`} className="ask-cite">{m[1]}</a> : <span key={j}>{part.replace(/\*\*/g, '')}</span>;
      })}
    </p>
  ));
}

export default function AskBox({ onCall = null }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [asked, setAsked] = useState('');
  const [rated, setRated] = useState(null);

  async function ask(text) {
    const question = (text ?? q).trim();
    if (question.length < 3 || busy) return;
    setBusy(true); setRes(null); setRated(null); setAsked(question);
    try { setRes(await askQuestion({ question })); }
    catch { setRes({ error: 'Something went wrong. Please try again.' }); }
    setBusy(false);
  }
  async function rate(helpful) { if (!res?.id) return; setRated(helpful); await rateAnswer({ id: res.id, helpful }); }

  return (
    <section className="card ask-box">
      <form onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <label className="sr-only" htmlFor="ask-q">Your question</label>
        <textarea id="ask-q" rows={3} maxLength={1000} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          placeholder="Ask about a policy or how to do something… e.g. “What do I do if a youth doesn’t come home?”" />
        <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="muted small">🔒 Don’t type names of youth or adults in care.</span>
          <button disabled={busy || q.trim().length < 3}>{busy ? 'Looking in the policies…' : 'Ask'}</button>
        </div>
      </form>
      {!res && !busy && (
        <div className="ask-examples">
          {EXAMPLES.map((e) => <button key={e} type="button" className="chip" onClick={() => { setQ(e); ask(e); }}>{e}</button>)}
        </div>
      )}

      {(res?.danger || res?.meds) && (
        <div className="message error ask-safety">
          {res.danger && <p style={{ margin: 0 }}><strong>🆘 If anyone is in danger, call 911 now</strong>, then on-call{onCall ? <>: <a href={`tel:${onCall.replace(/[^\d+]/g, '')}`}>{onCall}</a></> : ''}. A child or youth may be abused or neglected? Also call <a href="tel:18006639122">1-800-663-9122</a> yourself. Missing youth? Use <Link href="/missing">🔎 Missing youth</Link>.</p>}
          {res.meds && <p style={{ margin: res.danger ? '6px 0 0' : 0 }}><strong>💊 Medication:</strong> always follow the MAR and the pharmacist’s label. Unsure? Call on-call or the pharmacist before giving anything.</p>}
        </div>
      )}

      {res?.error && <p className={`message ${res.blocked ? '' : 'error'}`}>{res.error}</p>}
      {res && !res.error && (
        <div className="ask-answer">
          <p className="muted small" style={{ margin: 0 }}>You asked: “{asked}”</p>
          <Answer text={res.answer} />
          {res.sources?.length > 0 && (
            <>
              <h3 className="more-h" style={{ marginTop: 12 }}>From</h3>
              <ol className="ask-sources">
                {res.sources.map((s) => (
                  <li key={s.n} id={`src-${s.n}`} value={s.n}><Link href={s.link ?? '/policies'}>{s.title}</Link>{s.page ? <span className="muted small"> · page {s.page}</span> : null}</li>
                ))}
              </ol>
            </>
          )}
          <p className="muted small">Ask Evergreen can make mistakes. The policy itself is what counts — open it to check, and ask your Program Coordinator if you’re unsure.</p>
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            <span className="small">Was this helpful?</span>
            <button type="button" className={rated === true ? '' : 'secondary'} onClick={() => rate(true)}>👍 Yes</button>
            <button type="button" className={rated === false ? '' : 'secondary'} onClick={() => rate(false)}>👎 No</button>
            {rated !== null && <span className="small muted">Thanks!</span>}
          </div>
        </div>
      )}
    </section>
  );
}
