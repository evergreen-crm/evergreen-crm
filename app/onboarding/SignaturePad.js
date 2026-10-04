'use client';
// Draw a signature with a finger, pen or mouse. Saved once and shown on every signed item.
import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { saveSignature } from '@/app/onboarding/actions';

export default function SignaturePad({ existing }) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [editing, setEditing] = useState(!existing);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (!editing) return;
    const c = canvas.current; const ctx = c.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f3059';
  }, [editing]);

  const pos = (e) => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { e.preventDefault(); drawing.current = true; const ctx = canvas.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)); canvas.current.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!drawing.current) return; const ctx = canvas.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.stroke(); setEmpty(false); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canvas.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setEmpty(true); };

  async function save() {
    const res = await saveSignature(canvas.current.toDataURL('image/png'));
    if (res?.error) { setMsg(res.error); return; }
    setEditing(false); setMsg(null); router.refresh();
  }

  if (!editing) {
    return (
      <div className="sig-show">
        <img src={existing} alt="Your signature" />
        <button type="button" className="link small no-print" onClick={() => setEditing(true)}>Draw it again</button>
      </div>
    );
  }
  return (
    <div>
      <canvas ref={canvas} className="sig-pad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
      <div className="row">
        <button type="button" onClick={save} disabled={empty}>Save my signature</button>
        <button type="button" className="secondary" onClick={clear}>Clear</button>
        {existing && <button type="button" className="link" onClick={() => setEditing(false)}>Cancel</button>}
      </div>
      {msg && <p className="message">{msg}</p>}
    </div>
  );
}
