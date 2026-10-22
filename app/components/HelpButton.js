'use client';
// ❓ Help: tips for the page you're on, common questions, and "Ask for help" (goes to your Program
// Coordinator, or to the Administrator when something isn't working). Step 8.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { helpFor, HELP_TOPICS } from '@/lib/help';
import { askHelp } from '@/app/help/actions';

export default function HelpButton() {
  const path = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(HELP_TOPICS[0]);
  const [msg, setMsg] = useState('');
  const [state, setState] = useState(null); // 'sending' | 'sent' | { error }
  const h = helpFor(path);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);

  async function send() {
    setState('sending');
    const r = await askHelp({ topic, message: msg, page: path });
    if (r?.error) { setState({ error: r.error }); return; }
    setState('sent'); setMsg('');
  }

  return (
    <>
      <button type="button" className="help-btn" aria-label="Help" title="Help" onClick={() => { setOpen(true); setState(null); }}>❓<span> Help</span></button>
      {open && (
        <div className="sos-sheet help-sheet no-print" role="dialog" aria-modal="true" aria-label="Help" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sos-panel">
            <div className="rh-head"><h2 style={{ margin: 0 }}>❓ Help: {h.title}</h2><button type="button" className="secondary" onClick={() => setOpen(false)}>Close</button></div>
            <ul className="help-tips">{h.tips.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="small"><Link href="/help" onClick={() => setOpen(false)}>Common questions and my questions →</Link> · <Link href="/words" onClick={() => setOpen(false)}>What does this word mean? →</Link></p>
            <hr />
            <h3 style={{ margin: '8px 0' }}>Ask for help</h3>
            {state === 'sent' ? (
              <p className="message ok">✓ Sent. You’ll get an alert (and an email) when someone answers. You can see it under <Link href="/help" onClick={() => setOpen(false)}>Help → My questions</Link>.</p>
            ) : (
              <>
                <div className="help-topics">
                  {HELP_TOPICS.map((t) => (
                    <label key={t} className={`check pill${topic === t ? ' on' : ''}`}><input type="radio" name="help-topic" checked={topic === t} onChange={() => setTopic(t)} /> {t}</label>
                  ))}
                </div>
                <label>What do you need?
                  <textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={topic === 'Something isn’t working' ? 'What did you tap, and what happened?' : 'Ask your question…'} />
                </label>
                <p className="muted small">{topic === 'Something isn’t working' || topic === 'Sign-in or access' ? 'Goes to the Administrator.' : 'Goes to your Program Coordinator and Program Manager.'} This page is sent with it. If anyone is in danger, use 🆘 or call 911.</p>
                <button type="button" disabled={state === 'sending' || msg.trim().length < 3} onClick={send}>{state === 'sending' ? 'Sending…' : 'Send'}</button>
                {state?.error && <p className="message error small">{state.error}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
