'use client';
// A short form with its meaning: hover on a computer, tap on a phone. <Abbr t="MAR" /> or <Abbr t="KPI">KPIs</Abbr>
import { useState } from 'react';
import { glossary } from '@/lib/plain';

export default function Abbr({ t, children }) {
  const [open, setOpen] = useState(false);
  const g = glossary(t);
  if (!g) return <>{children ?? t}</>;
  return (
    <span className="abbr-wrap">
      <abbr title={`${g.name}: ${g.meaning}`} className="abbr" tabIndex={0} role="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } if (e.key === 'Escape') setOpen(false); }}
        onBlur={() => setOpen(false)}>{children ?? t}</abbr>
      {open && <span className="abbr-tip" role="tooltip"><strong>{g.name}</strong> — {g.meaning}</span>}
    </span>
  );
}
