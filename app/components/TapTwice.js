'use client';
// A submit button that needs two taps (Nov 21): the first turns it into "Tap again to …" for 4 seconds,
// so one mis-tap can't remove something. No pop-up, so it works the same on phones.
import { useEffect, useState } from 'react';

export default function TapTwice({ children, confirmText, className }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <button className={`${className ?? ''}${armed ? ' danger' : ''}`}
      onClick={(e) => { if (!armed) { e.preventDefault(); setArmed(true); } }}>
      {armed ? confirmText ?? 'Tap again to confirm' : children}
    </button>
  );
}
