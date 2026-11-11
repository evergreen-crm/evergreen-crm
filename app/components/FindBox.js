'use client';
// 🔍 Find: type a few words or a question ("where do I record a fire drill") to get the page, exactly where it
// sits in the menu, and step-by-step "How do I…?" answers. Words and steps live in lib/findGuide.js.
// Searches that find nothing are recorded (no names of people in care are sent anywhere outside the CRM)
// so leaders can see where staff get lost: Quality → Searches with no result.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { searchFind, whereOf } from '@/lib/findGuide';
import { logFindMiss } from '@/app/components/find-actions';

export default function FindBox({ items = [], autoFocus = false, onPick }) {
  const [q, setQ] = useState('');
  const text = q.trim();
  const res = useMemo(() => (text.length < 2 ? null : searchFind(text, items)), [text, items]);
  const none = res && !res.pages.length && !res.howtos.length;
  const logged = useRef(new Set());
  // Nothing found and the person stopped typing: remember the search so the words can be added.
  useEffect(() => {
    if (!none || text.length < 3 || logged.current.has(text.toLowerCase())) return undefined;
    const t = setTimeout(() => { logged.current.add(text.toLowerCase()); logFindMiss(text).catch(() => {}); }, 2500);
    return () => clearTimeout(t);
  }, [none, text]);

  return (
    <div className="findbox">
      <label className="findbox-input">
        <span aria-hidden="true">🔍</span>
        <input type="search" value={q} autoFocus={autoFocus} onChange={(e) => setQ(e.target.value)} placeholder="Find a page or ask “where do I…?”  e.g. fire drill, offer letter, time off" aria-label="Find a page or ask where to do something" />
      </label>
      {res && (
        <ul className="findbox-hits">
          {res.pages.map((h) => (
            <li key={h.href + h.label}>
              <Link href={h.href} onClick={onPick}><span>{h.icon}</span> <strong>{h.label}</strong><small className="findbox-where">📍 {whereOf(h)}</small></Link>
            </li>
          ))}
          {res.howtos.map((h) => (
            <li key={h.q} className="findbox-how">
              <details>
                <summary>❓ How do I: <strong>{h.q}</strong></summary>
                <ol>{h.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                <Link className="button" href={h.href} onClick={onPick}>{h.icon} Go to {h.label}</Link>
              </details>
            </li>
          ))}
          {none && <li className="muted small findbox-none">No page matches yet. Try one or two plain words (for example “vacation” or “incident”), or ask below.</li>}
          <li><Link href={`/ask?q=${encodeURIComponent(text)}`} onClick={onPick}><span>🤖</span> Ask Evergreen: “{text}”<small> · what the policies say</small></Link></li>
        </ul>
      )}
    </div>
  );
}
