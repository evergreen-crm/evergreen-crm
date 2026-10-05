'use client';
// Fill in and sign an intake form on any phone or computer.
import { useEffect, useRef, useState } from 'react';
import { submitIntake } from '@/app/f/actions';

function Signature({ onChange }) {
  const c = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const el = c.current; const r = window.devicePixelRatio || 1;
    el.width = el.offsetWidth * r; el.height = el.offsetHeight * r;
    const ctx = el.getContext('2d'); ctx.scale(r, r);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f3059';
  }, []);
  const pos = (e) => { const b = c.current.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  const down = (e) => { e.preventDefault(); drawing.current = true; c.current.setPointerCapture(e.pointerId); const ctx = c.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)); };
  const move = (e) => { if (!drawing.current) return; const ctx = c.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.stroke(); if (empty) setEmpty(false); };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange(c.current.toDataURL('image/png')); };
  const clear = () => { const el = c.current; el.getContext('2d').clearRect(0, 0, el.width, el.height); setEmpty(true); onChange(null); };
  return (
    <div>
      <canvas ref={c} className="sig-pad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
      <div className="row"><span className="muted small">{empty ? 'Sign with your finger, pen or mouse.' : 'Signature captured.'}</span>
        <button type="button" className="link small" onClick={clear}>Clear</button></div>
    </div>
  );
}

function Field({ f, value, set }) {
  const common = { id: f.name, name: f.name, required: !!f.required, placeholder: f.placeholder ?? '' };
  if (f.type === 'textarea') return <label>{f.label}{f.required && ' *'}<textarea rows={3} {...common} value={value ?? ''} onChange={(e) => set(e.target.value)} /></label>;
  if (f.type === 'select') return (
    <label>{f.label}{f.required && ' *'}
      <select {...common} value={value ?? ''} onChange={(e) => set(e.target.value)}>
        <option value="">Choose…</option>{f.options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
  if (f.type === 'radio') return (
    <fieldset className="if-radio"><legend>{f.label}{f.required && ' *'}</legend>
      {f.options.map((o) => (
        <label key={o} className="check"><input type="radio" name={f.name} value={o} checked={value === o} onChange={() => set(o)} required={!!f.required} /> {o}</label>
      ))}
    </fieldset>
  );
  if (f.type === 'check') return <label className="check"><input type="checkbox" name={f.name} checked={!!value} onChange={(e) => set(e.target.checked)} required={!!f.required} /> {f.label}</label>;
  return <label>{f.label}{f.required && ' *'}<input type={f.type === 'text' ? 'text' : f.type} {...common} value={value ?? ''} onChange={(e) => set(e.target.value)} /></label>;
}

export default function IntakeFormFill({ token, form, recipientName, recipientRole, roles }) {
  const [answers, setAnswers] = useState({});
  const [name, setName] = useState(recipientName ?? '');
  const [role, setRole] = useState(recipientRole ?? '');
  const [sig, setSig] = useState(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (!agree) { setMsg('Please tick the statement above your signature.'); return; }
    setBusy(true);
    const res = await submitIntake(token, form.key, answers, name, role, sig);
    setBusy(false);
    if (res?.error) { setMsg(res.error); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); return; }
    setDone(true); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (done) return (
    <div className="card if-done">
      <h2>✓ Thank you — signed and sent</h2>
      <p>Your form was received by Evergreen Community Care on {new Date().toLocaleString('en-CA', { timeZone: 'America/Vancouver' })} (Pacific time). You can close this page.</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="if-form">
      {form.sections.map((s) => (
        <section key={s.title} className="card">
          <h2>{s.title}</h2>
          <div className="if-grid">
            {s.fields.map((f) => (
              <div key={f.name} className={f.type === 'textarea' || f.type === 'radio' || f.type === 'check' ? 'if-wide' : ''}>
                <Field f={f} value={answers[f.name]} set={(v) => setAnswers((a) => ({ ...a, [f.name]: v }))} />
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="card if-sign">
        <h2>Signature</h2>
        <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> {form.attest}</label>
        <div className="if-grid">
          <label>Your full name *<input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>
          <label>You are signing as *
            <select value={role} onChange={(e) => setRole(e.target.value)} required>
              <option value="">Choose…</option>{roles.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <Signature onChange={setSig} />
        <p className="muted small">By signing you agree this electronic signature has the same effect as a handwritten one. The date and time are recorded by Evergreen’s system.</p>
        {msg && <p className="message">{msg}</p>}
        <button className="big-install" disabled={busy}>{busy ? 'Sending…' : '✓ Sign and send'}</button>
      </section>
    </form>
  );
}
