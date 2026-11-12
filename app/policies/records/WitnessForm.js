'use client';
// The witness signs the sign-off record once: tick, type their name, draw their signature.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SigPad } from '@/app/sign/SignPanel';
import { witnessRecord } from './actions';

export default function WitnessForm({ id, count, staffName, defaultName }) {
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState(defaultName);
  const [sig, setSig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const clear = useRef(null);
  const router = useRouter();
  async function sign() {
    setBusy(true); setMsg(null);
    const res = await witnessRecord({ id, name, image: sig, checked });
    setBusy(false);
    if (res?.error) { setMsg(res.error); return; }
    router.refresh();
  }
  return (
    <section className="card sign-box no-print">
      <h2 style={{ marginTop: 0 }}>Sign as witness</h2>
      <label className="check"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> I opened and checked the signed copy of each of the {count} policies above. Each one carries {staffName}’s signature, name and date.</label>
      <label>Your full name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" /></label>
      <p className="small" style={{ margin: '8px 0 4px' }}>Draw your signature with your finger, a pen or the mouse:</p>
      <SigPad onChange={setSig} clearRef={clear} />
      <div className="row">
        <button type="button" onClick={sign} disabled={busy || !checked || !sig || !name.trim()}>{busy ? 'Signing… this can take a minute' : '✍️ Sign as witness'}</button>
        <button type="button" className="secondary" onClick={() => clear.current?.()} disabled={busy}>Clear</button>
      </div>
      <p className="muted small">Your signature goes on the one-page record and into each signed policy. Once you sign, it can’t be changed.</p>
      {msg && <p className="message error">{msg}</p>}
    </section>
  );
}
