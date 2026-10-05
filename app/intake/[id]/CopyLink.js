'use client';
import { useState } from 'react';
export default function CopyLink({ url }) {
  const [done, setDone] = useState(false);
  return (
    <span className="small">
      <button type="button" className="link small" onClick={async () => { try { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000); } catch {} }}>
        {done ? '✓ Copied' : '🔗 Copy link'}</button>{' · '}
      <a href={url} target="_blank" rel="noreferrer">Open</a>
    </span>
  );
}
