'use client';
// 🤖 Ask Evergreen on every page: a round button on the right side (above 🆘) that opens a side panel.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AskBox from '@/app/ask/AskBox';

export default function AskSide({ onCall = null }) {
  const path = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);
  if (path.startsWith('/ask')) return null;
  return (
    <>
      <button type="button" className="ask-fab no-print" aria-label="Ask Evergreen" title="Ask Evergreen — policy and how-to questions" onClick={() => setOpen(true)}>🤖<span>Ask</span></button>
      {open && (
        <div className="ask-side-wrap no-print" role="dialog" aria-modal="true" aria-label="Ask Evergreen" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <aside className="ask-side">
            <div className="rh-head">
              <h2 style={{ margin: 0 }}>🤖 Ask Evergreen</h2>
              <button type="button" className="secondary" onClick={() => setOpen(false)}>Close</button>
            </div>
            <p className="muted small" style={{ margin: '4px 0 8px' }}>Ask how to do something or what a policy says. <Link href="/ask">Open full page →</Link></p>
            <AskBox onCall={onCall} compact />
          </aside>
        </div>
      )}
    </>
  );
}
