'use client';
// Sign a document (staff in the CRM, or an outside person from their email link).
// If the sender placed boxes for you on the PDF, they show on the pages: fill in each yellow box.
// Then confirm you read it, type your full name and draw your signature — or decline with a reason.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PdfPages, { BOX, fromPdfRect } from '@/app/sign/PdfPages';
import { signDocument, declineDocument } from '@/app/sign/actions';
import { signOutside, declineOutside } from '@/app/f/sign/actions';

const initialsOf = (n) => String(n).trim().split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('').slice(0, 4);
const todayText = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function SignPanel({ id, token, defaultName = '', fileUrl, fields = [], slot }) {
  const outside = !!token;
  const canvas = useRef(null);
  const drawing = useRef(false);
  const [sig, setSig] = useState(null);
  const [read, setRead] = useState(false);
  const [name, setName] = useState(defaultName);
  const [mode, setMode] = useState('sign');
  const [reason, setReason] = useState('');
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();
  const mine = useMemo(() => fields.filter((f) => f.who === slot), [fields, slot]);
  const others = useMemo(() => fields.filter((f) => f.who !== slot), [fields, slot]);
  const source = useMemo(() => ({ url: fileUrl }), [fileUrl]);

  // Start initials boxes with the person's initials.
  useEffect(() => {
    setValues((v) => {
      const n = { ...v };
      for (const f of mine) if (f.type === 'initials' && n[f.id] === undefined) n[f.id] = initialsOf(defaultName);
      return n;
    });
  }, [mine, defaultName]);

  useEffect(() => {
    if (mode !== 'sign') return;
    const c = canvas.current; if (!c) return;
    const ctx = c.getContext('2d'); const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f3059';
    setSig(null);
  }, [mode]);

  const pos = (e) => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { e.preventDefault(); drawing.current = true; const ctx = canvas.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)); canvas.current.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!drawing.current) return; const ctx = canvas.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.stroke(); drawing.current = 'drew'; };
  const up = () => { if (drawing.current === 'drew') setSig(signatureImage()); drawing.current = false; };
  const clear = () => { const c = canvas.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setSig(null); };

  // Shrink the drawing so it saves quickly (max 600 px wide), trimmed to the ink.
  function signatureImage() {
    const c = canvas.current; const ctx = c.getContext('2d');
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x1 = width, y1 = height, x2 = 0, y2 = 0;
    for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) if (data[(y * width + x) * 4 + 3] > 0) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    if (x2 <= x1 || y2 <= y1) { x1 = 0; y1 = 0; x2 = width; y2 = height; }
    const pad = 6; x1 = Math.max(0, x1 - pad); y1 = Math.max(0, y1 - pad); x2 = Math.min(width, x2 + pad); y2 = Math.min(height, y2 + pad);
    const sw = x2 - x1, sh = y2 - y1; const w = Math.min(600, sw); const h = Math.max(1, Math.round(sh * (w / sw)));
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    out.getContext('2d').drawImage(c, x1, y1, sw, sh, 0, 0, w, h);
    return out.toDataURL('image/png');
  }

  const missing = mine.filter((f) =>
    (f.type === 'text' && f.required && !String(values[f.id] ?? '').trim())
    || (f.type === 'initials' && !String(values[f.id] ?? '').trim())
    || (f.type === 'checkbox' && f.required && values[f.id] !== true));

  async function sign() {
    if (missing.length) { setMsg(`Please fill in ${missing.length} more yellow box${missing.length === 1 ? '' : 'es'} on the document.`); return; }
    setBusy(true); setMsg(null);
    const payload = { name, image: sig, agent: navigator.userAgent, values };
    const res = outside ? await signOutside(token, payload) : await signDocument({ id, ...payload });
    setBusy(false);
    if (res?.error) { setMsg(res.error); return; }
    router.refresh();
  }
  async function decline() {
    setBusy(true); setMsg(null);
    const res = outside ? await declineOutside(token, reason) : await declineDocument({ id, reason });
    setBusy(false);
    if (res?.error) { setMsg(res.error); return; }
    router.refresh();
  }

  const goPad = () => canvas.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const overlay = (page, { vp, scale }) => [
    ...others.filter((f) => f.page === page).map((f) => {
      const b = fromPdfRect(vp, f.rect);
      return <div key={f.id} className="fbox other" style={pos4(b)} title="For someone else to fill in" />;
    }),
    ...mine.filter((f) => f.page === page).map((f) => {
      const b = fromPdfRect(vp, f.rect); const hPx = b.fh * vp.height * scale;
      const fs = Math.max(9, Math.min(16, hPx * 0.62));
      const todo = missing.includes(f);
      const common = { className: `fbox${todo ? ' todo' : ''}`, style: pos4(b), title: f.label || BOX[f.type].label };
      if (f.type === 'signature') {
        return <div key={f.id} {...common} onClick={sig ? undefined : goPad}>{sig ? <img src={sig} alt="Your signature" /> : <span style={{ fontSize: fs }}>✍️ Sign below</span>}</div>;
      }
      if (f.type === 'date') return <div key={f.id} {...common}><span style={{ fontSize: fs }}>{todayText()}</span></div>;
      if (f.type === 'name') return <div key={f.id} {...common}><span style={{ fontSize: fs }}>{name || 'Your name'}</span></div>;
      if (f.type === 'checkbox') {
        return <div key={f.id} {...common}><input type="checkbox" aria-label={f.label || 'Checkbox'} checked={values[f.id] === true} onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.checked }))} /></div>;
      }
      const set = (e) => setValues((v) => ({ ...v, [f.id]: e.target.value }));
      return (
        <div key={f.id} {...common}>
          {f.type === 'text' && hPx >= 40
            ? <textarea value={values[f.id] ?? ''} maxLength={500} onChange={set} placeholder={f.label || ''} style={{ fontSize: fs * 0.8 }} aria-label={f.label || 'Text'} />
            : <input value={values[f.id] ?? ''} maxLength={f.type === 'initials' ? 8 : 500} onChange={set} placeholder={f.label || (f.type === 'initials' ? 'Initials' : '')} style={{ fontSize: fs, fontStyle: f.type === 'initials' ? 'italic' : undefined }} aria-label={f.label || BOX[f.type].label} />}
        </div>
      );
    }),
  ];

  if (mode === 'decline') {
    return (
      <section className="card no-print">
        <h2>Not signing</h2>
        <label>Why aren’t you signing? Your answer goes to the person who sent it.
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., I need to check point 2 before I sign" />
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
    <>
      {fields.length > 0 && fileUrl && (
        <section className="card no-print">
          <h2 style={{ marginTop: 0 }}>📄 The document</h2>
          {mine.length > 0
            ? <p className="small">Fill in the <strong style={{ background: '#fff3b0', padding: '0 4px' }}>yellow boxes</strong> ({mine.length}). Your signature, the date and your name fill in by themselves when you sign below.{missing.length ? <> <span className="badge warn">{missing.length} left</span></> : <> <span className="badge">all filled</span></>}</p>
            : <p className="small muted">Read the document, then sign below.</p>}
          <PdfPages source={source} overlay={overlay} />
        </section>
      )}
      <section className="card no-print">
        <h2>Sign this document</h2>
        <label className="check"><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /> I have read the whole document and I understand it.</label>
        <label>Your full name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" /></label>
        <p className="small" style={{ margin: '8px 0 4px' }}>Draw your signature with your finger, a pen or the mouse:</p>
        <canvas ref={canvas} className="sig-pad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
        <div className="row">
          <button type="button" onClick={sign} disabled={busy || !read || !sig || !name.trim()}>{busy ? 'Signing…' : '✍️ Sign'}</button>
          <button type="button" className="secondary" onClick={clear} disabled={busy}>Clear</button>
          <button type="button" className="link" onClick={() => setMode('decline')} disabled={busy}>I won’t sign this</button>
        </div>
        <p className="muted small">Signing electronically is the same as signing on paper. Once you sign, it can’t be changed.</p>
        {msg && <p className="message error">{msg}</p>}
      </section>
    </>
  );
}

const pos4 = (b) => ({ left: `${b.fx * 100}%`, top: `${b.fy * 100}%`, width: `${b.fw * 100}%`, height: `${b.fh * 100}%` });
