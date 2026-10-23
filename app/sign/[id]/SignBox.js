'use client';
// Sign: confirm you read it, type your full name, draw your signature. Or decline with a reason.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signDocument, declineDocument } from '@/app/sign/actions';

export default function SignBox({ id, defaultName }) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [read, setRead] = useState(false);
  const [name, setName] = useState(defaultName);
  const [mode, setMode] = useState('sign');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (mode !== 'sign') return;
    const c = canvas.current; if (!c) return;
    const ctx = c.getContext('2d'); const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f3059';
    setEmpty(true);
  }, [mode]);

  const pos = (e) => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { e.preventDefault(); drawing.current = true; const ctx = canvas.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)); canvas.current.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!drawing.current) return; const ctx = canvas.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.stroke(); setEmpty(false); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canvas.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setEmpty(true); };

  // Shrink the drawing so it saves quickly (max 600 px wide).
  function signatureImage() {
    const c = canvas.current; const w = Math.min(600, c.width); const h = Math.round(c.height * (w / c.width));
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    out.getContext('2d').drawImage(c, 0, 0, w, h);
    return out.toDataURL('image/png');
  }

  async function sign() {
    setBusy(true); setMsg(null);
    const res = await signDocument({ id, name, image: signatureImage(), agent: navigator.userAgent });
    setBusy(false);
    if (res?.error) { setMsg(res.error); return; }
    router.refresh();
  }
  async function decline() {
    setBusy(true); setMsg(null);
    const res = await declineDocument({ id, reason });
    setBusy(false);
    if (res?.error) { setMsg(res.error); return; }
    router.refresh();
  }

  if (mode === 'decline') {
    return (
      <section className="card no-print">
        <h2>Not signing</h2>
        <label>Why aren’t you signing? Your answer goes to the person who sent it.
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., I disagree with point 2 and would like to meet first" />
        </label>
        <div className="row">
          <button type="button" onClick={decline} disabled={busy || !reason.trim()}>{busy ? 'Sending…' : 'Send my answer'}</button>
          <button type="button" className="secondary" onClick={() => setMode('sign')} disabled={busy}>Back to signing</button>
        </div>
        {msg && <p className="message error">{msg}</p>}
      </section>
    );
  }
  return (
    <section className="card no-print">
      <h2>Sign this document</h2>
      <label className="check"><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /> I have read the whole document and I understand it.</label>
      <label>Your full name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" /></label>
      <p className="small" style={{ margin: '8px 0 4px' }}>Draw your signature with your finger, a pen or the mouse:</p>
      <canvas ref={canvas} className="sig-pad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
      <div className="row">
        <button type="button" onClick={sign} disabled={busy || !read || empty || !name.trim()}>{busy ? 'Signing…' : '✍️ Sign'}</button>
        <button type="button" className="secondary" onClick={clear} disabled={busy}>Clear</button>
        <button type="button" className="link" onClick={() => setMode('decline')} disabled={busy}>I won’t sign this</button>
      </div>
      <p className="muted small">Signing is the same as signing on paper. Once you sign, it can’t be changed.</p>
      {msg && <p className="message error">{msg}</p>}
    </section>
  );
}
