'use client';
// Inactivity timer: signs the person out after IDLE_MINUTES with no use (mouse, keys, touch, scrolling).
// One minute before, a warning with "Stay signed in" appears. Works across tabs: using any tab counts.
import { useEffect, useRef, useState } from 'react';

export const IDLE_MINUTES = 15;
const WARN_SECONDS = 60;
const KEY = 'evg-last-activity';

const readLast = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
const writeLast = (t) => { try { localStorage.setItem(KEY, String(t)); } catch { /* private mode */ } };

export default function IdleLogout() {
  const last = useRef(Date.now());
  const [left, setLeft] = useState(null); // seconds left while warning, else null

  useEffect(() => {
    const limit = IDLE_MINUTES * 60 * 1000;
    let lastWrite = 0;
    const touch = () => {
      const now = Date.now();
      last.current = now;
      if (now - lastWrite > 5000) { lastWrite = now; writeLast(now); } // share with other tabs, not on every mouse move
    };
    touch();
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const tick = setInterval(() => {
      const newest = Math.max(last.current, readLast()); // another tab may have been used
      last.current = newest;
      const remaining = Math.ceil((newest + limit - Date.now()) / 1000);
      if (remaining <= 0) { clearInterval(tick); window.location.href = '/auth/signout?reason=idle'; return; }
      setLeft(remaining <= WARN_SECONDS ? remaining : null);
    }, 1000);
    return () => { clearInterval(tick); events.forEach((e) => window.removeEventListener(e, touch)); };
  }, []);

  if (left === null) return null;
  const stay = () => { last.current = Date.now(); writeLast(last.current); setLeft(null); };
  return (
    <div role="alertdialog" aria-live="assertive" className="no-print"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card" style={{ maxWidth: 380, textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>⏱ Still there?</h2>
        <p>You haven’t used the portal for {IDLE_MINUTES} minutes. For privacy you will be signed out in <strong>{left} seconds</strong>.</p>
        <button onClick={stay} autoFocus>Stay signed in</button>{' '}
        <a href="/auth/signout?reason=idle" className="button secondary">Sign out now</a>
      </div>
    </div>
  );
}
