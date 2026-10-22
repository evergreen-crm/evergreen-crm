'use client';
// Phone helpers, on every page:
//  1. Tables become stacked cards on small screens: each cell gets its column name (data-label) from the table header.
//     Tables marked className="wide" (month grids, big admin tables) keep scrolling sideways with the first column pinned.
//  2. Forms can't be sent twice: the button that was tapped shows "Saving…" and every submit button in that form is
//     disabled until the page answers (re-enabled when the page answers, or after 8 s).
//  3. A small bar shows when the phone is offline.
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const locked = new Set();
function unlockAll() {
  locked.forEach((b) => {
    if (!b.dataset.wasDisabled) b.disabled = false;
    delete b.dataset.saving;
  });
  locked.clear();
}

function labelTables(root = document) {
  root.querySelectorAll('table').forEach((t) => {
    if (t.dataset.cards === 'done' || t.classList.contains('matrix') || t.classList.contains('ps-items')) return;
    if (t.classList.contains('wide')) { t.dataset.cards = 'done'; return; }
    const heads = [...t.querySelectorAll('thead tr:last-child th')].map((th) => th.textContent.trim());
    if (!heads.length) return;
    t.querySelectorAll('tbody tr').forEach((tr) => {
      let i = 0;
      [...tr.children].forEach((td) => {
        const label = heads[i] ?? '';
        if (label && !td.hasAttribute('data-label')) td.setAttribute('data-label', label);
        i += Number(td.getAttribute('colspan') || 1);
      });
    });
    t.classList.add('cardify');
    t.dataset.cards = 'done';
  });
}

export default function PhoneHelpers() {
  const path = usePathname();
  const query = useSearchParams()?.toString();
  const [offline, setOffline] = useState(false);

  // The page answered (a redirect or a new page): unlock any "Saving…" buttons.
  useEffect(() => { unlockAll(); }, [path, query]);

  useEffect(() => {
    labelTables();
    let timer = null;
    const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => labelTables(), 80); });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { obs.disconnect(); clearTimeout(timer); };
  }, [path]);

  useEffect(() => {
    const onSubmit = (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.method?.toLowerCase() === 'get' || form.dataset.noguard !== undefined) return;
      const tapped = e.submitter;
      const buttons = [...form.querySelectorAll('button[type=submit], button:not([type]), input[type=submit]')];
      // Let the browser read the tapped button's name/value first, then lock.
      setTimeout(() => {
        buttons.forEach((b) => { b.dataset.wasDisabled = b.disabled ? '1' : ''; b.disabled = true; locked.add(b); });
        if (tapped && tapped.tagName === 'BUTTON') tapped.dataset.saving = '1';  // CSS shows “Saving…” (React keeps the button’s text)
        setTimeout(unlockAll, 8000);
      }, 0);
    };
    document.addEventListener('submit', onSubmit, true);
    const on = () => setOffline(false), off = () => setOffline(true);
    setOffline(typeof navigator !== 'undefined' && navigator.onLine === false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { document.removeEventListener('submit', onSubmit, true); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  return offline ? <div className="offline-bar no-print" role="status">📶 You’re offline. You can keep typing — save when the connection is back.</div> : null;
}
