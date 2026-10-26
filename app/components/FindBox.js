'use client';
// 🔍 Find: type a few letters to jump to any page this person can open (list from lib/menu.js).
import { useMemo, useState } from 'react';
import Link from 'next/link';

export default function FindBox({ items = [], autoFocus = false, onPick }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const words = t.split(/\s+/);
    return items.filter((it) => words.every((w) => `${it.label} ${it.where ?? ''}`.toLowerCase().includes(w))).slice(0, 8);
  }, [q, items]);
  return (
    <div className="findbox">
      <label className="findbox-input">
        <span aria-hidden="true">🔍</span>
        <input type="search" value={q} autoFocus={autoFocus} onChange={(e) => setQ(e.target.value)} placeholder="Find a page — e.g. fire drill, sick, timesheet" aria-label="Find a page" />
      </label>
      {q.trim().length >= 2 && (
        <ul className="findbox-hits">
          {hits.length ? hits.map((h) => (
            <li key={h.href + h.label}><Link href={h.href} onClick={onPick}><span>{h.icon}</span> {h.label}<small> · {h.where}</small></Link></li>
          )) : <li className="muted small">Nothing found. Try another word, or tap ❓ Help.</li>}
        </ul>
      )}
    </div>
  );
}
