'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { withdrawApplication } from '@/app/apply/actions';

export default function Withdraw({ token }) {
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();
  if (!ask) return <p><button type="button" className="link small" onClick={() => setAsk(true)}>Withdraw my application</button></p>;
  return (
    <p className="small">Withdraw this application? HR will stop reviewing it.{' '}
      <button type="button" className="danger small" onClick={async () => { const r = await withdrawApplication(token); if (r?.error) setMsg(r.error); else router.refresh(); }}>Yes, withdraw</button>{' '}
      <button type="button" className="secondary small" onClick={() => setAsk(false)}>Keep it</button>
      {msg && <span className="message"> {msg}</span>}
    </p>
  );
}
