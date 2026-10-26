'use client';
// 💡 Suggestion: send an idea, concern, compliment or CRM problem from any page, with or without your name.
// It goes to the directors (QA portal → Suggestions). See answers under 💡 My suggestions (/suggest).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SUGGESTION_KINDS } from '@/lib/suggestions';
import { sendSuggestion } from '@/app/suggest/actions';

export default function SuggestButton() {
  const path = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('Idea');
  const [msg, setMsg] = useState('');
  const [anon, setAnon] = useState(false);
  const [state, setState] = useState(null); // 'sending' | 'sent' | { error }
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);

  async function send() {
    setState('sending');
    const r = await sendSuggestion({ kind, message: msg, anonymous: anon, page: path });
    if (r?.error) { setState({ error: r.error }); return; }
    setState('sent'); setMsg('');
  }

  return (
    <>
      <button type="button" className="help-btn" aria-label="Suggestion" title="Send a suggestion" onClick={() => { setOpen(true); setState(null); }}>💡<span> Suggest</span></button>
      {open && (
        <div className="sos-sheet help-sheet no-print" role="dialog" aria-modal="true" aria-label="Send a suggestion" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sos-panel">
            <div className="rh-head"><h2 style={{ margin: 0 }}>💡 Send a suggestion</h2><button type="button" className="secondary" onClick={() => setOpen(false)}>Close</button></div>
            {state === 'sent' ? (
              <>
                <p className="message ok">✓ Thank you! It went to the directors.{anon ? ' Your name was not sent.' : ' You’ll get an alert when they answer.'}</p>
                <p className="small"><Link href="/suggest" onClick={() => setOpen(false)}>💡 My suggestions →</Link></p>
              </>
            ) : (
              <>
                <div className="help-topics">
                  {SUGGESTION_KINDS.map((k) => (
                    <label key={k.key} className={`check pill${kind === k.key ? ' on' : ''}`}><input type="radio" name="sug-kind" checked={kind === k.key} onChange={() => setKind(k.key)} /> {k.icon} {k.key}</label>
                  ))}
                </div>
                <p className="muted small" style={{ margin: '4px 0' }}>{SUGGESTION_KINDS.find((k) => k.key === kind)?.hint}</p>
                <label>Your message
                  <textarea rows={4} value={msg} maxLength={3000} onChange={(e) => setMsg(e.target.value)} placeholder="Write it in your own words…" />
                </label>
                <label className="check"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Send without my name</label>
                <p className="muted small">{anon ? 'Your name is not saved, so you won’t see an answer.' : 'The directors see your name and can answer you.'} Abuse or a child in danger must also be reported right away (🆘, 911 or 1-800-663-9122).</p>
                <button type="button" disabled={state === 'sending' || msg.trim().length < 3} onClick={send}>{state === 'sending' ? 'Sending…' : 'Send'}</button>
                {state?.error && <p className="message error small">{state.error}</p>}
                <p className="small"><Link href="/suggest" onClick={() => setOpen(false)}>💡 My suggestions →</Link></p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
