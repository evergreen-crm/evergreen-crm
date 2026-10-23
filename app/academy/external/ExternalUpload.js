'use client';
// Upload proof for a free government course. Nothing is complete until the proof is uploaded and a manager verifies it.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { prepareOne, contentTypeFor, MAX_LABEL } from '@/lib/uploadRules';
import { submitExternalCourse } from './actions';

export default function ExternalUpload({ courseKey, proof, profileId, today, name }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();
  const needsFile = proof !== 'reading';

  async function onSubmit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    setBusy(true); setMsg(null);
    let file_path = null; let file = f.file?.files?.[0]; let note = '';
    if (needsFile && !file) { setBusy(false); setMsg({ bad: true, text: proof === 'screenshot' ? 'Please choose your completion screenshot.' : 'Please choose your certificate file.' }); return; }
    if (file) {
      const ready = await prepareOne(file); // zip with one file is unpacked; photos made smaller; max 10 MB
      if (ready.error) { setBusy(false); setMsg({ bad: true, text: ready.error }); return; }
      file = ready.file; note = ready.note;
      file_path = `${profileId}/academy-${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
      const { error } = await createClient().storage.from('staff-files').upload(file_path, file, { contentType: contentTypeFor(file) });
      if (error) { setBusy(false); setMsg({ bad: true, text: 'Upload failed: ' + error.message }); return; }
    }
    const res = await submitExternalCourse(courseKey, {
      completed_on: f.completed_on.value, attest: f.attest.checked, notes: f.notes.value,
      reflection: f.reflection?.value, file_path,
    });
    setBusy(false);
    if (res?.error) { setMsg({ bad: true, text: res.error }); return; }
    f.reset();
    setMsg({ bad: false, text: 'Sent. Your manager will check it — once verified, the course is complete in your training record.' + note });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card no-print">
      <h2>{proof === 'reading' ? 'Show what you learned' : proof === 'screenshot' ? 'Upload your completion screenshot' : 'Upload your certificate'}</h2>
      <div className="row">
        <label>Date completed<input type="date" name="completed_on" required max={today} /></label>
        {needsFile && <label>{proof === 'screenshot' ? 'Screenshot of the completion page' : `Certificate (PDF or photo, max ${MAX_LABEL})`}<input type="file" name="file" accept=".pdf,image/*,.zip" required /></label>}
      </div>
      {proof === 'reading' && (
        <label>3 things you learned, and how they change what you’ll do on shift
          <textarea name="reflection" rows={5} required minLength={80} />
        </label>
      )}
      <label>Notes (optional)<input name="notes" placeholder={proof === 'screenshot' ? 'e.g. which module you completed' : ''} /></label>
      <label className="row" style={{ alignItems: 'flex-start', gap: 8, fontWeight: 'normal' }}>
        <input type="checkbox" name="attest" required style={{ width: 'auto', marginTop: 4 }} />
        <span>I, {name}, completed this course myself{proof === 'reading' ? ' and read the whole handbook' : ''}. I understand false records are a serious breach of policy.</span>
      </label>
      <button disabled={busy}>{busy ? 'Sending…' : 'Send for verification'}</button>
      {msg && <p className={`message ${msg.bad ? '' : 'ok'}`}>{msg.text}</p>}
    </form>
  );
}
