'use client';
// The 12-section online application (plan B5). Saves as a draft; sign and send at the end.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveAnswers, submitApplication, removeFile } from '@/app/apply/actions';
import { SECTIONS, prequalQuestions, EDUCATION_LEVELS, highestEducation, CERT_PICKS, LANG_LEVELS, HEARD, missingFor } from '@/lib/jobs';

const clone = (o) => JSON.parse(JSON.stringify(o));
function setPath(obj, path, value) {
  const keys = path.split('.'); const out = clone(obj); let cur = out;
  for (let i = 0; i < keys.length - 1; i++) { const k = keys[i]; cur[k] = cur[k] ?? (/^\d+$/.test(keys[i + 1]) ? [] : {}); cur = cur[k]; }
  cur[keys.at(-1)] = value; return out;
}
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export default function ApplyForm({ token, posting, initial, files: initialFiles }) {
  const [a, setA] = useState(initial);
  const [files, setFiles] = useState(initialFiles);
  const [saved, setSaved] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sign, setSign] = useState('');
  const dirty = useRef(false);
  const router = useRouter();
  const set = (path, v) => { dirty.current = true; setA((x) => setPath(x, path, v)); };
  const qs = prequalQuestions(posting);

  // Save by itself every 30 seconds while typing.
  useEffect(() => {
    const t = setInterval(async () => { if (!dirty.current) return; dirty.current = false; const r = await saveAnswers(token, a); if (r?.ok) setSaved(r.savedAt); }, 30000);
    return () => clearInterval(t);
  }, [a, token]);

  async function save() {
    setBusy(true); setMsg(null);
    const r = await saveAnswers(token, a);
    setBusy(false);
    if (r?.error) setMsg({ bad: true, text: r.error }); else { dirty.current = false; setSaved(r.savedAt); setMsg({ bad: false, text: 'Saved. You can close this page and come back with the link in your email.' }); }
  }
  async function upload(kind, file) {
    if (!file) return;
    setBusy(true); setMsg(null);
    const fd = new FormData(); fd.append('token', token); fd.append('kind', kind); fd.append('file', file);
    try {
      const res = await fetch('/api/apply-upload', { method: 'POST', body: fd });
      const r = await res.json();
      if (r.error) setMsg({ bad: true, text: r.error }); else setFiles((f) => ({ ...f, [kind]: r.name }));
    } catch { setMsg({ bad: true, text: 'Could not upload. Check your internet and try again.' }); }
    setBusy(false);
  }
  async function dropFile(kind) {
    const r = await removeFile(token, kind);
    if (!r?.error) setFiles((f) => ({ ...f, [kind]: null }));
  }
  async function send(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await submitApplication(token, a, sign);
    setBusy(false);
    if (r?.error) { setMsg({ bad: true, text: r.error }); return; }
    router.refresh();
  }

  const T = (label, path, props = {}) => <label>{label}<input value={get(a, path) ?? ''} onChange={(e) => set(path, e.target.value)} {...props} /></label>;
  const Area = (label, path, props = {}) => <label>{label}<textarea rows={3} value={get(a, path) ?? ''} onChange={(e) => set(path, e.target.value)} {...props} /></label>;
  const Sel = (label, path, options, props = {}) => (
    <label>{label}<select value={get(a, path) ?? ''} onChange={(e) => set(path, e.target.value)} {...props}>
      <option value="">Choose…</option>{options.map((o) => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>)}
    </select></label>
  );
  const YesNo = (path, extra = []) => (
    <span className="row" style={{ gap: 12 }}>
      {[['yes', 'Yes'], ['no', 'No'], ...extra].map(([v, l]) => (
        <label key={v} className="check"><input type="radio" name={path} checked={get(a, path) === v} onChange={() => set(path, v)} /> {l}</label>))}
    </span>
  );
  const List = (path, render, blank = {}, max = 8, addLabel = '+ Add another') => {
    const list = get(a, path) ?? [];
    return (
      <>
        {list.map((_, i) => (
          <div key={i} className="card" style={{ background: 'transparent' }}>
            {render(i)}
            {list.length > 1 && <button type="button" className="link small" onClick={() => set(path, list.filter((__, j) => j !== i))}>Remove</button>}
          </div>))}
        {list.length < max && <button type="button" className="secondary small" onClick={() => set(path, [...list, clone(blank)])}>{addLabel}</button>}
      </>
    );
  };
  // A section (called as a function, not a component, so typing never loses focus).
  const sec = (id, open, children) => {
    const [, label] = SECTIONS.find(([k]) => k === id);
    const n = SECTIONS.findIndex(([k]) => k === id) + 1;
    return <details key={id} className="card" open={open || undefined}><summary><strong>{n}. {label}</strong></summary><div style={{ marginTop: 10 }}>{children}</div></details>;
  };
  const missing = missingFor(a, { posting, resume_path: files.resume });
  const highest = highestEducation(a.education);

  return (
    <form onSubmit={send}>
      <p className="small">Fill in each section. Your answers are saved as you go (and when you press <strong>Save</strong>). Fields marked * are needed to send.</p>

      {sec('contact', true, <>
        <div className="row">{T('First name *', 'contact.first', { autoComplete: 'given-name', maxLength: 80 })}{T('Last name *', 'contact.last', { autoComplete: 'family-name', maxLength: 80 })}</div>
        <div className="row">{T('Email', 'contact.email', { disabled: true })}{T('Phone *', 'contact.phone', { type: 'tel', autoComplete: 'tel', maxLength: 40 })}</div>
        {T('Street address', 'contact.address', { autoComplete: 'street-address', maxLength: 200 })}
        <div className="row">{T('City', 'contact.city', { autoComplete: 'address-level2', maxLength: 80 })}{T('Postal code', 'contact.postal', { autoComplete: 'postal-code', maxLength: 10 })}</div>
        {Sel('How should we contact you? *', 'contact.preferred', ['Email', 'Phone call', 'Text message'])}
      </>)}

      {sec('job', false, <>
        <p><strong>{posting?.title}</strong> · Job ID {posting?.job_id}</p>
        <p className="small muted">To apply for another job too, open that job on the Careers page and start an application there. Each application has its own resume and cover letter, so the right letter goes with the right job.</p>
      </>)}

      {sec('prequal', false, <>
        {qs.map((q) => (
          <div key={q.key} style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 4px' }}>{q.q}{q.must ? ' *' : ''}</p>
            {YesNo(`prequal.${q.key}`)}
            {q.expiry && get(a, `prequal.${q.key}`) === 'yes' && <div className="row">{T('If your permit expires, the expiry date', `prequal.${q.key}_expiry`, { type: 'date' })}</div>}
            {q.must && get(a, `prequal.${q.key}`) === 'no' && <p className="small message">Thank you for being honest. This is usually needed for the job; you can still send your application and HR will review it.</p>}
          </div>))}
      </>)}

      {sec('files', false, <>
        <p className="small">PDF or Word only, up to 2 MB each. No zip files.</p>
        {['resume', 'cover'].map((k) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <strong>{k === 'resume' ? 'Resume *' : 'Cover letter (optional)'}</strong>
            {files[k] ? <p className="small">📄 {files[k]} <button type="button" className="link small" onClick={() => dropFile(k)}>Remove</button></p>
              : <p><input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={(e) => upload(k, e.target.files?.[0])} /></p>}
          </div>))}
      </>)}

      {sec('education', false, <>
        {List('education', (i) => (<>
          <div className="row">{T('School, college or university', `education.${i}.school`, { maxLength: 120 })}{Sel('Level', `education.${i}.level`, EDUCATION_LEVELS)}</div>
          <div className="row">{T('Program, degree or diploma', `education.${i}.program`, { maxLength: 120 })}{T('Year finished (or expected)', `education.${i}.year`, { inputMode: 'numeric', maxLength: 4 })}</div>
        </>))}
        <p className="small">Highest education level: <strong>{highest ?? '—'}</strong> (worked out from what you entered).</p>
      </>)}

      {sec('work', false, <>
        <div className="row">
          {T('Years working with children and youth', 'experience.youth', { inputMode: 'decimal', maxLength: 4 })}
          {T('Years working with adults with disabilities', 'experience.adults', { inputMode: 'decimal', maxLength: 4 })}
          {T('Years with autism or complex needs', 'experience.complex', { inputMode: 'decimal', maxLength: 4 })}
        </div>
        {List('work', (i) => (<>
          <div className="row">{T('Employer', `work.${i}.employer`, { maxLength: 120 })}{T('Job title', `work.${i}.title`, { maxLength: 120 })}</div>
          <div className="row">{T('Start date', `work.${i}.start`, { type: 'month' })}{!get(a, `work.${i}.current`) && T('End date', `work.${i}.end`, { type: 'month' })}
            <label className="check"><input type="checkbox" checked={!!get(a, `work.${i}.current`)} onChange={(e) => set(`work.${i}.current`, e.target.checked)} /> This is my current job</label></div>
          {T('Supervisor’s name', `work.${i}.supervisor`, { maxLength: 120 })}
          {Area('Main duties', `work.${i}.duties`, { maxLength: 1500 })}
        </>), {}, 10)}
      </>)}

      {sec('certs', false, <>
        {List('certs', (i) => (<>
          <div className="row">{Sel('Licence or certificate', `certs.${i}.name`, CERT_PICKS)}{get(a, `certs.${i}.name`) === 'Other' && T('Name', `certs.${i}.other`, { maxLength: 120 })}</div>
          <div className="row">{T('Number (optional)', `certs.${i}.number`, { maxLength: 60 })}{T('Date issued', `certs.${i}.issued`, { type: 'date' })}{T('Expiry date', `certs.${i}.expires`, { type: 'date' })}</div>
        </>), {}, 12)}
        <p className="small muted">Bring the certificates to your interview. If you are hired, they go into your staff file and expiry reminders start right away.</p>
      </>)}

      {sec('languages', false, <>
        {List('languages', (i) => (
          <div className="row">{T('Language', `languages.${i}.language`, { maxLength: 60 })}{Sel('Speaking', `languages.${i}.speak`, LANG_LEVELS)}{Sel('Reading', `languages.${i}.read`, LANG_LEVELS)}{Sel('Writing', `languages.${i}.write`, LANG_LEVELS)}</div>
        ), {}, 6)}
      </>)}

      {sec('refs', false, <>
        <p className="small">Three professional references <strong>who supervised you</strong> (not co-workers, friends or family). We contact them only if you move to the reference stage.</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card" style={{ background: 'transparent' }}>
            <strong>Reference {i + 1} *</strong>
            <div className="row">{T('Name *', `refs.${i}.name`, { maxLength: 120 })}{T('Their job title', `refs.${i}.title`, { maxLength: 120 })}</div>
            <div className="row">{T('Agency / employer *', `refs.${i}.agency`, { maxLength: 120 })}{T('How long they supervised you', `refs.${i}.how_long`, { maxLength: 60 })}</div>
            <div className="row">{T('Email *', `refs.${i}.email`, { type: 'email', maxLength: 200 })}{T('Phone *', `refs.${i}.phone`, { type: 'tel', maxLength: 40 })}</div>
          </div>))}
      </>)}

      {sec('referral', false, <>
        {Sel('How did you hear about this job?', 'referral.heard', HEARD)}
        {T('Referred by an Evergreen staff member? Their name', 'referral.staff', { maxLength: 120 })}
        <p style={{ margin: '8px 0 4px' }}>Have you worked for Evergreen Community Care before?</p>{YesNo('referral.former')}
      </>)}

      {sec('questions', false, <>
        <div className="row">{T('Wage expectation', 'questions.wage', { inputMode: 'decimal', maxLength: 12 })}{Sel('Per', 'questions.wage_unit', [['hour', 'hour'], ['year', 'year']])}</div>
        <p style={{ margin: '8px 0 4px' }}>Conflict of interest: are you related to, or do you know, a person in Evergreen’s care, or do you work for another agency that serves them? *</p>
        {YesNo('questions.conflict', [['unsure', 'Not sure']])}
        {['yes', 'unsure'].includes(get(a, 'questions.conflict')) && Area('Please explain briefly', 'questions.conflict_detail', { maxLength: 800 })}
        <p style={{ margin: '8px 0 4px' }}>Do you need an accommodation during the hiring process (for example, for the interview)?</p>
        {YesNo('questions.accommodation', [['skip', 'Prefer not to answer']])}
        <details style={{ marginTop: 10 }}><summary className="small"><strong>Optional: self-identification</strong> (only HR sees this; it is never used to decide)</summary>
          <p className="small muted">You can skip any question. No documents are asked for at this stage.</p>
          {Sel('Do you identify as First Nations, Métis or Inuit?', 'questions.selfid.indigenous', ['Yes', 'No', 'Prefer not to answer'])}
          {Sel('Do you identify as a person with a disability?', 'questions.selfid.disability', ['Yes', 'No', 'Prefer not to answer'])}
          {Sel('Do you identify as a member of a racialized group?', 'questions.selfid.racialized', ['Yes', 'No', 'Prefer not to answer'])}
          {Sel('Do you identify as 2SLGBTQIA+?', 'questions.selfid.lgbtq', ['Yes', 'No', 'Prefer not to answer'])}
        </details>
      </>)}

      {sec('declaration', true, <>
        <p>I confirm the information in this application is true and complete. I understand that false or missing information can end the hiring process, or my employment if I am hired. If I move forward, I consent to Evergreen Community Care contacting my references and doing a criminal record check and the MCFD / CLBC screening needed for this work.</p>
        {missing.length > 0 && <div className="message small"><strong>Still needed before you can send:</strong><ul>{missing.map((m) => <li key={m}>{m}</li>)}</ul></div>}
        <label>Type your full name to sign *<input value={sign} onChange={(e) => setSign(e.target.value)} placeholder={`${a.contact?.first ?? ''} ${a.contact?.last ?? ''}`.trim()} autoComplete="off" /></label>
        <div className="row" style={{ alignItems: 'center' }}>
          <button type="button" className="secondary" onClick={save} disabled={busy}>💾 Save</button>
          <button disabled={busy || missing.length > 0}>{busy ? 'Working…' : '✅ Sign and send my application'}</button>
        </div>
      </>)}

      {saved && <p className="small muted">Last saved {new Date(saved).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}.</p>}
      {msg && <p className={`message ${msg.bad ? '' : 'ok'}`}>{msg.text}</p>}
      <p className="no-print"><button type="button" className="secondary" onClick={save} disabled={busy}>💾 Save and finish later</button></p>
    </form>
  );
}
