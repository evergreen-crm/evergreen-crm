'use client';
// The applicant fills in their prescreen and signs it, on any phone, tablet or computer.
import { useEffect, useRef, useState } from 'react';
import { submitPrescreen, savePrescreenDraft } from '@/app/f/prescreen/actions';
import { refErrors, cleanRefs } from '@/lib/referenceForm';
import { POSITIONS, WORKER_TYPES, PROGRAMS, AVAIL, POPS, YEARS, SELF, REF_RELATIONS, INTERVIEW_DAYS, INTERVIEW_TIMES, extraNeeds, validateApplication } from '@/lib/prescreen';
import { checklistFor, checklistErrors, STATUS } from '@/lib/prescreenChecklist';

// Phone photos are often 3–6 MB: shrink pictures to about 1600 px (JPEG) before uploading.
async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|heic|heif|webp)$/i.test(file.type) || file.size < 900 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return blob ? new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

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

const STEP2_GROUPS = ['About you', 'How we work'];
const STEPS = ['Start', 'Prequalify questionnaire', 'Resume', 'Attachments', 'Qualifications', 'References', 'Interview availability', 'Review and submit'];

export default function PrescreenFill({ token, start }) {
  const pre = start.prefill ?? {};
  const [a, setA] = useState({
    applicant: { first: start.first, last: start.last, email: start.email, phone: start.phone, position: start.position, program: start.program ?? '', avail: [], address: pre.address ?? '' },
    screen: { drive: start.drives ? 'yes' : '', outside: pre.outside ?? '' },
    experience: { pops: [], roles: [0, 1].map((i) => pre.roles?.[i] ?? {}), summary: pre.summary ?? '', years: '' },
    self: {}, refs: [0, 1, 2].map((i) => pre.refs?.[i] ?? {}), consent: {},
    check: pre.check ?? {}, interview_avail: { slots: [], note: '' },
    ...(start.draft ?? {}),
  });
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(start.draftSavedAt ?? null);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState(start.files ?? { resume: null, cover: null, docs: [] });
  const [uploading, setUploading] = useState(null);
  const [upErr, setUpErr] = useState(null);
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

  const groups = checklistFor({ program: ap.program || start.program, drives: sc.drive === 'yes' || start.drives, meds: start.meds, outside: sc.outside === 'yes' });
  async function upload(what, file) {
    if (!file) return;
    setUploading(what); setUpErr(null);
    const fd = new FormData(); fd.append('token', token); fd.append('what', what); fd.append('file', await shrinkImage(file));
    try {
      const r = await (await fetch('/f/prescreen/upload', { method: 'POST', body: fd })).json();
      if (r.error) setUpErr(r.error);
      else if (what === 'resume' || what === 'cover') setFiles((f) => ({ ...f, [what]: r.name }));
      else setFiles((f) => ({ ...f, docs: [...(f.docs ?? []), { key: what, name: r.name, path: r.path }] }));
    } catch { setUpErr('Could not upload. Check your internet and try again.'); }
    setUploading(null);
  }
  async function removeFile(what, path) {
    const fd = new FormData(); fd.append('token', token); fd.append('what', what); fd.append('remove', '1'); if (path) fd.append('path', path);
    await fetch('/f/prescreen/upload', { method: 'POST', body: fd }).catch(() => {});
    if (what === 'resume' || what === 'cover') setFiles((f) => ({ ...f, [what]: null }));
    else setFiles((f) => ({ ...f, docs: (f.docs ?? []).filter((d) => d.path !== path) }));
  }
  const setCheck = (k, patch) => setA((prev) => ({ ...prev, check: { ...prev.check, [k]: { ...(prev.check[k] ?? {}), ...patch } } }));
  const toggleSlot = (v) => setA((prev) => { const sl = prev.interview_avail.slots; return { ...prev, interview_avail: { ...prev.interview_avail, slots: sl.includes(v) ? sl.filter((x) => x !== v) : [...sl, v] } }; });

  async function submit(e) {
    e.preventDefault();
    // Keep the older "certificates you have now" answers filled from the checklist.
    for (const g of groups) for (const i of g.items) if (i.selfKey && a.check[i.k]) a.self[i.selfKey] = { has: a.check[i.k].status === 'yes' ? 'yes' : a.check[i.k].status === 'progress' ? 'progress' : 'no', exp: a.check[i.k].exp ?? '' };
    const errs = [...validateApplication(a, name, sig), ...checklistErrors(a.check, groups, files)];
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
      <p>Evergreen Community Care received it on {new Date().toLocaleString('en-CA', { timeZone: 'Etc/GMT+7' })} (Pacific time){start.applicationNo ? <> · application <strong>{start.applicationNo}</strong></> : null}. Your references have been emailed their forms. Our team reviews your pre-screen first; if it passes, we email you an interview time from the availability you gave. You can close this page.</p>
    </div>
  );

  const T = (label, path, props = {}) => {
    const v = path.split('.').reduce((o, k) => o?.[k], a) ?? '';
    return <label>{label}<input {...props} value={v} onChange={(e) => set(path, e.target.value)} /></label>;
  };
  const renderGroups = (list) => list.map((g) => (
          <fieldset key={g.group} className="ps-job">
            <legend>{g.group}</legend>
            {g.items.map((i) => {
              const v = a.check[i.k] ?? {};
              const docs = (files.docs ?? []).filter((d) => d.key === i.k);
              return (
                <div key={i.k} className="ps-check-item" style={{ padding: '10px 0', borderBottom: '1px solid #eef1ef' }}>
                  <div><strong>{i.l}</strong>{i.optional && <span className="muted small"> (if you have it)</span>}</div>
                  {i.hint && <div className="muted small">{i.hint}</div>}
                  {i.kind === 'later' && <div className="small">✓ Nothing to do now.</div>}
                  {i.kind === 'resume' && (
                    files.resume ? <div className="small">📄 {files.resume} <button type="button" className="link small" onClick={() => removeFile('resume')}>Remove</button></div>
                      : <label className="button secondary small" style={{ display: 'inline-block', marginTop: 6 }}>{uploading === 'resume' ? 'Uploading…' : '📎 Upload resume'}
                          <input type="file" hidden accept=".pdf,.doc,.docx,image/*" onChange={(e) => upload('resume', e.target.files?.[0])} /></label>
                  )}
                  {(i.kind === 'confirm' || i.kind === 'consent') && (
                    <div className="row" style={{ gap: 14, marginTop: 6 }}>
                      <label className="check"><input type="radio" name={`ck_${i.k}`} checked={v.status === 'yes'} onChange={() => setCheck(i.k, { status: 'yes' })} /> {i.kind === 'consent' ? 'Yes, I agree' : 'Yes'}</label>
                      <label className="check"><input type="radio" name={`ck_${i.k}`} checked={v.status === 'no'} onChange={() => setCheck(i.k, { status: 'no' })} /> No</label>
                    </div>
                  )}
                  {i.kind === 'doc' && (
                    <div className="row" style={{ gap: 14, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {Object.entries(STATUS).map(([k, l]) => <label key={k} className="check"><input type="radio" name={`ck_${i.k}`} checked={v.status === k} onChange={() => setCheck(i.k, { status: k })} /> {l}</label>)}
                      {i.exp && v.status === 'yes' && <label className="small">Expiry date <input type="date" value={v.exp ?? ''} onChange={(e) => setCheck(i.k, { exp: e.target.value })} /></label>}
                    </div>
                  )}
                  {(i.kind === 'doc' || i.k === 'crc') && (v.status === 'yes' || docs.length > 0) && (
                    <div className="small" style={{ marginTop: 6 }}>
                      {docs.map((d) => <div key={d.path}>📄 {d.name} <button type="button" className="link small" onClick={() => removeFile(i.k, d.path)}>Remove</button></div>)}
                      <label className="button secondary small" style={{ display: 'inline-block', marginTop: 4 }}>{uploading === i.k ? 'Uploading…' : docs.length ? '📷 Add another photo or file' : '📷 Upload a photo or PDF'}
                        <input type="file" hidden accept="image/*,.pdf" onChange={(e) => upload(i.k, e.target.files?.[0])} /></label>
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>
        ));
  // Step status: Not started / In progress / Complete.
  const filled = (v) => (typeof v === 'string' ? v.trim() !== '' : v != null && v !== false);
  const ckDone = (list) => checklistErrors(a.check, list, files).length === 0;
  const ckAny = (list) => list.some((g) => g.items.some((i) => a.check[i.k]?.status));
  const step2 = groups.filter((g) => STEP2_GROUPS.includes(g.group));
  const step4 = groups.filter((g) => !STEP2_GROUPS.includes(g.group)).map((g) => ({ ...g, items: g.items.filter((i) => i.kind !== 'resume') })).filter((g) => g.items.length);
  const stat = (doneFlag, anyFlag) => (doneFlag ? 'Complete' : anyFlag ? 'In progress' : 'Not started');
  const status = [
    stat(['first', 'last', 'dob', 'phone', 'email', 'address', 'position', 'type', 'program'].every((k) => filled(ap[k])), ['dob', 'address', 'type'].some((k) => filled(ap[k]))),
    stat(filled(sc.drive) && filled(sc.outside) && filled(sc.coi) && (sc.coi !== 'yes' || filled(sc.coiDetail)) && ckDone(step2), filled(sc.coi) || ckAny(step2)),
    stat(!!files.resume, !!files.cover),
    stat(ckDone(step4), ckAny(step4) || (files.docs ?? []).length > 0),
    stat(filled(ex.years) && (ex.summary ?? '').trim().length >= 40, filled(ex.years) || filled(ex.summary)),
    stat(refErrors(cleanRefs(a.refs), ap.email).length === 0, a.refs.some((r) => filled(r.name))),
    stat(a.interview_avail.slots.length > 0 || filled(a.interview_avail.note), false),
    stat(false, !!name || !!sig),
  ];
  async function saveDraft() {
    setSaving(true);
    const r = await savePrescreenDraft(token, a);
    setSaving(false);
    if (r?.ok) setSaved(r.savedAt); else if (r?.error) setErrors([r.error]);
  }
  const go = async (n) => { saveDraft(); setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const show = (n) => ({ display: step === n ? undefined : 'none' });
  const needs = ap.program ? extraNeeds({ program: ap.program, drives: sc.drive === 'yes', outside: sc.outside === 'yes' }) : null;

  return (
    <form onSubmit={submit} className="if-form" noValidate>
      <nav className="card ps-wizard no-print" aria-label="Steps">
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STEPS.map((l, i) => (
            <li key={l}><button type="button" onClick={() => go(i + 1)} className={step === i + 1 ? 'small' : 'secondary small'}
              style={{ textAlign: 'left' }} aria-current={step === i + 1 ? 'step' : undefined}>
              {status[i] === 'Complete' ? '✅' : status[i] === 'In progress' ? '🟡' : '⚪'} {i + 1}. {l}<br /><span className="muted" style={{ fontSize: '0.75em' }}>{step === i + 1 ? 'You are here' : status[i]}</span></button></li>
          ))}
        </ol>
        <p className="muted small" style={{ margin: '6px 0 0' }}>{saved ? `Draft saved ${new Date(saved).toLocaleString('en-CA', { timeZone: 'Etc/GMT+7', dateStyle: 'medium', timeStyle: 'short' }).replace(/\.$/, '')}.` : 'Your answers are saved as a draft when you press Save or Next.'} Uploaded files are saved right away.</p>
      </nav>
      <section className="card" style={show(1)}>
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

      <section className="card" style={show(2)}>
        <h2>2. Prequalify questionnaire</h2>
        <div className="if-grid">
          <label>Will you drive for work or transport residents? *<YesNo value={sc.drive} onChange={(v) => set('screen.drive', v)} /></label>
          <label>Have you lived outside BC in the last 10 years? *<YesNo value={sc.outside} onChange={(v) => set('screen.outside', v)} /></label>
          {sc.outside === 'yes' && <div className="if-wide">{T('Where did you live, and when?', 'screen.where', { placeholder: 'e.g. Alberta, 2019–2022' })}</div>}
          <label className="if-wide">Conflict of interest: are you related to, or do you have a personal or financial relationship with, a current resident, their family, or an Evergreen employee? Do you have other work that could conflict with this role? *
            <YesNo value={sc.coi} onChange={(v) => set('screen.coi', v)} /></label>
          {sc.coi === 'yes' && <label className="if-wide">Please explain<textarea rows={2} value={sc.coiDetail ?? ''} onChange={(e) => set('screen.coiDetail', e.target.value)} /></label>}
        </div>
        {needs && <div className="message ok"><strong>For your role you’ll also need:</strong><ul>{needs.map((n) => <li key={n}>{n}</li>)}</ul></div>}
        {renderGroups(step2)}
      </section>

      <section className="card" style={show(3)}>
        <h2>3. Resume</h2>
        <p className="small">Upload your resume (PDF, Word or a clear photo). A cover letter is optional.</p>
        {upErr && step === 3 && <p className="message small">{upErr}</p>}
        <p>{files.resume ? <>📄 {files.resume} <button type="button" className="link small" onClick={() => removeFile('resume')}>Remove</button></> : <label className="button" style={{ display: 'inline-block' }}>{uploading === 'resume' ? 'Uploading…' : '📎 Upload resume *'}<input type="file" hidden accept=".pdf,.doc,.docx,image/*" onChange={(e) => upload('resume', e.target.files?.[0])} /></label>}</p>
        <p className="small">Cover letter (optional): {files.cover ? <>📄 {files.cover} <button type="button" className="link small" onClick={() => removeFile('cover')}>Remove</button></> : <label className="link small" style={{ cursor: 'pointer' }}>{uploading === 'cover' ? 'Uploading…' : 'upload'}<input type="file" hidden accept=".pdf,.doc,.docx" onChange={(e) => upload('cover', e.target.files?.[0])} /></label>}</p>
      </section>

      <section className="card" style={show(5)}>
        <h2>5. Qualifications and experience</h2>
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

      <section className="card" style={show(4)}>
        <h2>4. Attachments: requirements checklist and certificates</h2>
        <p className="small">Tick each item. Where you have a certificate, upload a photo or PDF of it (your phone camera works). It’s fine if you don’t have some yet: choose “In progress” or “Not yet”.</p>
        {upErr && <p className="message small">{upErr}</p>}
        {renderGroups(groups.filter((g) => !STEP2_GROUPS.includes(g.group)).map((g) => ({ ...g, items: g.items.filter((i) => i.kind !== 'resume') })).filter((g) => g.items.length))}
      </section>

      <section className="card" style={show(6)}>
        <h2>6. Three supervisor references</h2>
        <p className="small">Give three people who <strong>supervised or managed you</strong> at an agency or workplace (a manager, program coordinator, clinical or practicum supervisor). No co-workers, family or friends. <strong>Each one is emailed a short reference form as soon as you sign</strong>, so please check their email addresses.</p>
        {[0, 1, 2].map((i) => (
          <fieldset key={i} className="ps-job">
            <legend>Reference {i + 1}</legend>
            <div className="if-grid">
              {T('Full name *', `refs.${i}.name`)}
              {T('Their job title *', `refs.${i}.title`)}
              {T('Agency / organization *', `refs.${i}.org`)}
              <label>How they supervised you *
                <select value={a.refs[i].rel ?? ''} onChange={(e) => set(`refs.${i}.rel`, e.target.value)}>
                  <option value="">Choose…</option>{REF_RELATIONS.map((r) => <option key={r}>{r}</option>)}
                </select></label>
              {T('Phone *', `refs.${i}.phone`, { type: 'tel' })}
              {T('Email *', `refs.${i}.email`, { type: 'email' })}
              {T('How long have they known you?', `refs.${i}.years`, { placeholder: 'e.g. 2 years' })}
            </div>
          </fieldset>
        ))}
      </section>

      <section className="card" style={show(7)}>
        <h2>7. When can you come to an interview?</h2>
        <p className="small">Tick every time that works for you in the next two weeks. If your pre-screen passes, we set the interview from these times and email you.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="small">
            <thead><tr><th></th>{INTERVIEW_TIMES.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
            <tbody>{INTERVIEW_DAYS.map((d) => (
              <tr key={d}><td><strong>{d}</strong></td>{INTERVIEW_TIMES.map(([k]) => (
                <td key={k} style={{ textAlign: 'center' }}><input type="checkbox" aria-label={`${d} ${k}`} style={{ width: 22, height: 22 }} checked={a.interview_avail.slots.includes(`${d} ${k}`)} onChange={() => toggleSlot(`${d} ${k}`)} /></td>))}</tr>))}
            </tbody>
          </table>
        </div>
        <label>Anything else about your availability (optional)<input value={a.interview_avail.note} maxLength={300} onChange={(e) => setA((prev) => ({ ...prev, interview_avail: { ...prev.interview_avail, note: e.target.value } }))} placeholder="e.g. not before Dec 1; video call preferred" /></label>
      </section>

      {step === 8 && <section className="card if-sign">
        <h2>8. Review and submit</h2>
        <ul className="small" style={{ listStyle: 'none', paddingLeft: 0 }}>{STEPS.slice(0, 7).map((l, i) => (
          <li key={l}>{status[i] === 'Complete' ? '✅' : '⚠️'} {i + 1}. {l}: {status[i]}{status[i] !== 'Complete' && <> · <button type="button" className="link small" onClick={() => go(i + 1)}>go to this step</button></>}</li>))}
        </ul>
        <h3>Declaration and signature</h3>
        <label className="check"><input type="checkbox" checked={!!a.consent.truthful} onChange={(e) => set('consent.truthful', e.target.checked)} /> I confirm everything I have written in this pre-screen is true and complete. I understand that false, misleading or missing information ends my application, or my employment if it is found later.</label>
        <label className="check"><input type="checkbox" checked={!!a.consent.documents} onChange={(e) => set('consent.documents', e.target.checked)} /> Every document, certificate and photo I upload is genuine, belongs to me and has not been changed in any way. I understand Evergreen checks them with the issuer, and that a false or altered document ends my application or employment and may be reported (Evergreen Applicant Honesty and Document Authenticity Policy).</label>
        <label className="check"><input type="checkbox" checked={!!a.consent.verify} onChange={(e) => set('consent.verify', e.target.checked)} /> I authorize Evergreen Community Care to contact my references and to verify my previous employment, education, registrations and certifications.</label>
        <label className="check"><input type="checkbox" checked={!!a.consent.screening} onChange={(e) => set('consent.screening', e.target.checked)} /> I understand I must complete a criminal record check under the Criminal Records Review Act and any MCFD, CLBC, licensing, health and driver screening that applies to my role, and that I cannot work independently until I am cleared.</label>
        <label>Type your full legal name *<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <Signature onChange={setSig} />
        <p className="muted small">By signing you agree this electronic signature has the same effect as a handwritten one. The date and time are recorded by Evergreen’s system.</p>
        <div id="ps-errors">{errors.length > 0 && <div className="message"><strong>Please fix the following:</strong><ul>{errors.map((x) => <li key={x}>{x}</li>)}</ul></div>}</div>
        <button className="big-install" disabled={busy}>{busy ? 'Sending…' : '✓ Sign and send'}</button>
      </section>}

      <div className="row no-print" style={{ justifyContent: 'space-between', alignItems: 'center', margin: '12px 0' }}>
        <button type="button" className="secondary" disabled={step === 1} onClick={() => go(step - 1)}>← Back</button>
        <button type="button" className="secondary" disabled={saving} onClick={saveDraft}>{saving ? 'Saving…' : '💾 Save as draft'}</button>
        {step < 8 ? <button type="button" onClick={() => go(step + 1)}>Next →</button> : <span />}
      </div>
    </form>
  );
}
