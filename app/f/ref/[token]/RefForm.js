'use client';
// The reference questions: big tap-friendly buttons, short text boxes, typed-name signature.
import { useState } from 'react';
import { REF_FORM, RATING_WORDS } from '@/lib/referenceForm';
import { submitReference } from '@/app/f/ref/actions';

function Choice({ value, options, onPick }) {
  return (
    <div className="survey-opts" role="radiogroup">
      {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onPick(v)}>{l}</button>)}
    </div>
  );
}

export default function RefForm({ token, about, defaults = {} }) {
  const [a, setA] = useState({ ...defaults });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);
  const set = (k, v) => setA((x) => ({ ...x, [k]: v }));
  const T = (label, k, props = {}) => <label>{label}<input value={a[k] ?? ''} onChange={(e) => set(k, e.target.value)} {...props} /></label>;

  async function send() {
    setBusy(true); setMsg(null);
    const r = await submitReference(token, a);
    setBusy(false);
    if (r?.error) { setMsg(r.error); return; }
    setDone(true);
  }
  if (done) return <div className="card if-done"><h2>✓ Thank you!</h2><p>Your reference for {about} was received. We appreciate your time.</p></div>;
  return (
    <div className="card survey">
      <fieldset className="survey-q">
        <legend><strong>1.</strong> Did you directly supervise or manage {about}? *</legend>
        <Choice value={a.supervised} options={[['yes', 'Yes'], ['no', 'No']]} onPick={(v) => set('supervised', v)} />
      </fieldset>
      <div className="if-grid">
        {T('Your job title *', 'your_title')}
        {T('Your agency / organization *', 'agency')}
        {T(`${about}’s position`, 'position')}
        {T('How do you know them?', 'relationship', { placeholder: 'e.g. I was their program coordinator' })}
        {T('Worked together from (month / year) *', 'from', { placeholder: 'e.g. 03/2022' })}
        {T('To (leave empty if still working there)', 'to', { placeholder: 'e.g. 08/2025' })}
      </div>
      {REF_FORM.ratings.map(([k, l], i) => (
        <fieldset key={k} className="survey-q">
          <legend><strong>{i + 2}.</strong> {l}</legend>
          <Choice value={a[`r_${k}`]} options={[5, 4, 3, 2, 1].map((n) => [n, RATING_WORDS[n]])} onPick={(v) => set(`r_${k}`, v)} />
        </fieldset>
      ))}
      {REF_FORM.text.map(([k, l]) => <label key={k}>{l}<textarea rows={2} maxLength={2000} value={a[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></label>)}
      <fieldset className="survey-q">
        <legend>Would you rehire {about}? *</legend>
        <Choice value={a.rehire} options={[['Yes', 'Yes'], ['No', 'No'], ['Unsure / policy', 'Unsure / not allowed to say']]} onPick={(v) => set('rehire', v)} />
      </fieldset>
      <fieldset className="survey-q">
        <legend>Do you have any concern about {about} working with children, youth or vulnerable adults? *</legend>
        <Choice value={a.concern} options={[['no', 'No'], ['yes', 'Yes']]} onPick={(v) => set('concern', v)} />
      </fieldset>
      {a.concern === 'yes' && <label>Please tell us about your concern *<textarea rows={3} maxLength={2000} value={a.concern_detail ?? ''} onChange={(e) => set('concern_detail', e.target.value)} /></label>}
      <label>Anything else? (optional)<textarea rows={3} maxLength={3000} value={a.comments ?? ''} onChange={(e) => set('comments', e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={!!a.truthful} onChange={(e) => set('truthful', e.target.checked)} /> The information I gave is true to the best of my knowledge. *</label>
      {T('Type your full name to sign *', 'signed_name', { autoComplete: 'name' })}
      <button type="button" className="big-install" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send my reference'}</button>
      {msg && <p className="message error">{msg}</p>}
    </div>
  );
}
