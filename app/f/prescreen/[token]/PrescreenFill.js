'use client';
// The applicant fills in their prescreen and signs it, on any phone, tablet or computer.
import { useEffect, useRef, useState } from 'react';
import { submitPrescreen } from '@/app/f/prescreen/actions';
import { POSITIONS, WORKER_TYPES, PROGRAMS, AVAIL, POPS, YEARS, SELF, REF_RELATIONS, extraNeeds, validateApplication } from '@/lib/prescreen';

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

const YesNo = ({ value, onChange }) => (
  <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
    <option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option>
  </select>
);

export default function PrescreenFill({ token, start }) {
  const [a, setA] = useState({
    applicant: { first: start.first, last: start.last, email: start.email, phone: start.phone, position: start.position, program: '', avail: [] },
    screen: {}, experience: { pops: [], roles: [{}, {}] }, self: {}, refs: [{}, {}, {}], consent: {},
  });
  const [name, setName] = useState('');
  const [sig, setSig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [done, setDone] = useState(false);

  // set('applicant.first', 'Sam') / set('refs.0.name', 'Lee')
  const set = (path, v) => setA((prev) => {
    const next = structuredClone(prev); const keys = path.split('.'); let o = next;
    keys.slice(0, -1).forEach((k) => { o = o[k]; }); o[keys.at(-1)] = v; return next;
  });
  const toggle = (path, v) => { const [g, k] = path.split('.'); const arr = a[g][k] ?? []; set(path, arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]); };
  const ap = a.applicant, sc = a.screen, ex = a.experience;

  async function submit(e) {
    e.preventDefault();
    const errs = validateApplication(a, name, sig);
    setErrors(errs);
    if (errs.length) { document.getElementById('ps-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    setBusy(true);
    const res = await submitPrescreen(token, a, name, sig);
    setBusy(false);
    if (res?.error) { setErrors([res.error]); return; }
    setDone(true); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (done) return (
    <div className="card if-done">
      <h2>✓ Thank you, your prescreen was sent</h2>
      <p>Evergreen Community Care received it on {new Date().toLocaleString('en-CA', { timeZone: 'America/Vancouver' })} (Pacific time). We’ll contact you about next steps. You can close this page.</p>
    </div>
  );

  const T = (label, path, props = {}) => {
    const v = path.split('.').reduce((o, k) => o?.[k], a) ?? '';
    return <label>{label}<input {...props} value={v} onChange={(e) => set(path, e.target.value)} /></label>;
  };
  const needs = ap.program ? extraNeeds({ program: ap.program, drives: sc.drive === 'yes', outside: sc.outside === 'yes' }) : null;

  return (
    <form onSubmit={submit} className="if-form" noValidate>
      <section className="card">
        <h2>1. Your details</h2>
        <div className="if-grid">
          {T('First name *', 'applicant.first', { autoComplete: 'given-name' })}
          {T('Last name *', 'applicant.last', { autoComplete: 'family-name' })}
          {T('Date of birth *', 'applicant.dob', { type: 'date' })}
          {T('Phone *', 'applicant.phone', { type: 'tel', autoComplete: 'tel' })}
          {T('Email *', 'applicant.email', { type: 'email', autoComplete: 'email' })}
          {T('Earliest start date', 'applicant.start', { type: 'date' })}
          <div className="if-wide">{T('Home address *', 'applicant.address', { autoComplete: 'street-address', placeholder: 'Street, city, postal code' })}</div>
          <label>Position applying for *
            <select value={ap.position ?? ''} onChange={(e) => set('applicant.position', e.target.value)}>
              <option value="">Choose…</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}
            </select></label>
          <label>I am applying as *
            <select value={ap.type ?? ''} onChange={(e) => set('applicant.type', e.target.value)}>
              <option value="">Choose…</option>{WORKER_TYPES.map((p) => <option key={p}>{p}</option>)}
            </select></label>
          <label>I will work with *
            <select value={ap.program ?? ''} onChange={(e) => set('applicant.program', e.target.value)}>
              <option value="">Choose…</option>{PROGRAMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
          <fieldset className="if-radio if-wide"><legend>Shifts you can work</legend>
            {AVAIL.map((v) => <label key={v} className="check"><input type="checkbox" checked={ap.avail.includes(v)} onChange={() => toggle('applicant.avail', v)} /> {v}</label>)}
          </fieldset>
        </div>
      </section>

      <section className="card">
        <h2>2. Screening questions</h2>
        <div className="if-grid">
          <label>Will you drive for work or transport residents? *<YesNo value={sc.drive} onChange={(v) => set('screen.drive', v)} /></label>
          <label>Have you lived outside BC in the last 10 years? *<YesNo value={sc.outside} onChange={(v) => set('screen.outside', v)} /></label>
          {sc.outside === 'yes' && <div className="if-wide">{T('Where did you live, and when?', 'screen.where', { placeholder: 'e.g. Alberta, 2019–2022' })}</div>}
          <label className="if-wide">Conflict of interest: are you related to, or do you have a personal or financial relationship with, a current resident, their family, or an Evergreen employee? Do you have other work that could conflict with this role? *
            <YesNo value={sc.coi} onChange={(v) => set('screen.coi', v)} /></label>
          {sc.coi === 'yes' && <label className="if-wide">Please explain<textarea rows={2} value={sc.coiDetail ?? ''} onChange={(e) => set('screen.coiDetail', e.target.value)} /></label>}
        </div>
        {needs && <div className="message ok"><strong>For your role you’ll also need:</strong><ul>{needs.map((n) => <li key={n}>{n}</li>)}</ul></div>}
      </section>

      <section className="card">
        <h2>3. Your experience</h2>
        <div className="if-grid">
          <label>Years supporting people in care *
            <select value={ex.years ?? ''} onChange={(e) => set('experience.years', e.target.value)}>
              <option value="">Choose…</option>{YEARS.map((y) => <option key={y}>{y}</option>)}
            </select></label>
          <fieldset className="if-radio if-wide"><legend>People you have supported</legend>
            {POPS.map((v) => <label key={v} className="check"><input type="checkbox" checked={ex.pops.includes(v)} onChange={() => toggle('experience.pops', v)} /> {v}</label>)}
          </fieldset>
          <label className="if-wide">Describe your experience in your own words * <span className="muted small">Where you’ve worked, who you supported, and what a typical shift looked like.</span>
            <textarea rows={6} value={ex.summary ?? ''} onChange={(e) => set('experience.summary', e.target.value)} /></label>
        </div>
        {[0, 1].map((i) => (
          <fieldset key={i} className="ps-job">
            <legend>Recent job {i + 1}{i ? ' (optional)' : ''}</legend>
            <div className="if-grid">
              {T('Employer', `experience.roles.${i}.employer`)}
              {T('Job title', `experience.roles.${i}.title`)}
              {T('From', `experience.roles.${i}.from`, { type: 'month' })}
              {T('To (blank if current)', `experience.roles.${i}.to`, { type: 'month' })}
              <label className="if-wide">Main duties<textarea rows={3} value={ex.roles[i].duties ?? ''} onChange={(e) => set(`experience.roles.${i}.duties`, e.target.value)} /></label>
            </div>
          </fieldset>
        ))}
        <label>Anything else we should know?<textarea rows={3} value={ex.other ?? ''} onChange={(e) => set('experience.other', e.target.value)} /></label>
      </section>

      <section className="card">
        <h2>4. Certificates you have now</h2>
        <p className="muted small">We’ll ask for copies later. It’s fine if you don’t have some of these yet.</p>
        <table>
          <thead><tr><th>Certificate</th><th>Do you have it?</th><th>Expiry date</th></tr></thead>
          <tbody>{SELF.map((s) => (
            <tr key={s.k}>
              <td>{s.l}</td>
              <td><select value={a.self[s.k]?.has ?? ''} onChange={(e) => set(`self.${s.k}`, { ...(a.self[s.k] ?? {}), has: e.target.value })}>
                <option value="">Choose…</option><option value="yes">Yes</option><option value="progress">In progress</option><option value="no">No</option></select></td>
              <td>{s.exp ? <input type="date" value={a.self[s.k]?.exp ?? ''} onChange={(e) => set(`self.${s.k}`, { ...(a.self[s.k] ?? {}), exp: e.target.value })} /> : <span className="muted">—</span>}</td>
            </tr>))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>5. Three references</h2>
        <p className="small">Give three work references. <strong>At least one must be a current or past manager or supervisor.</strong> No family members or friends.</p>
        {[0, 1, 2].map((i) => (
          <fieldset key={i} className="ps-job">
            <legend>Reference {i + 1}</legend>
            <div className="if-grid">
              {T('Full name *', `refs.${i}.name`)}
              {T('Their job title *', `refs.${i}.title`)}
              {T('Organization *', `refs.${i}.org`)}
              <label>Relationship to you *
                <select value={a.refs[i].rel ?? ''} onChange={(e) => set(`refs.${i}.rel`, e.target.value)}>
                  <option value="">Choose…</option>{REF_RELATIONS.map((r) => <option key={r}>{r}</option>)}
                </select></label>
              {T('Phone *', `refs.${i}.phone`, { type: 'tel' })}
              {T('Email', `refs.${i}.email`, { type: 'email' })}
              {T('How long have they known you?', `refs.${i}.years`, { placeholder: 'e.g. 2 years' })}
            </div>
          </fieldset>
        ))}
      </section>

      <section className="card if-sign">
        <h2>6. Declaration & signature</h2>
        <label className="check"><input type="checkbox" checked={!!a.consent.truthful} onChange={(e) => set('consent.truthful', e.target.checked)} /> I confirm the information I have given is true and complete. I understand that false or missing information may end my application or employment.</label>
        <label className="check"><input type="checkbox" checked={!!a.consent.verify} onChange={(e) => set('consent.verify', e.target.checked)} /> I authorize Evergreen Community Care to contact my references and to verify my previous employment, education, registrations and certifications.</label>
        <label className="check"><input type="checkbox" checked={!!a.consent.screening} onChange={(e) => set('consent.screening', e.target.checked)} /> I understand I must complete a criminal record check under the Criminal Records Review Act and any MCFD, CLBC, licensing, health and driver screening that applies to my role, and that I cannot work independently until I am cleared.</label>
        <label>Type your full legal name *<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <Signature onChange={setSig} />
        <p className="muted small">By signing you agree this electronic signature has the same effect as a handwritten one. The date and time are recorded by Evergreen’s system.</p>
        <div id="ps-errors">{errors.length > 0 && <div className="message"><strong>Please fix the following:</strong><ul>{errors.map((x) => <li key={x}>{x}</li>)}</ul></div>}</div>
        <button className="big-install" disabled={busy}>{busy ? 'Sending…' : '✓ Sign and send'}</button>
      </section>
    </form>
  );
}
