'use client';
// Staff: add a training date (and optionally the certificate file). A manager then verifies it.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addMyTraining } from '@/app/academy/actions';
import { compressImage, fmtSize } from '@/lib/compressImage';

export default function AddTraining({ profileId, trainings, today, preset }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [title, setTitle] = useState(preset ?? '');
  const router = useRouter();
  const match = trainings.find((t) => t.title === title);

  async function onSubmit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    setBusy(true); setMsg(null);
    let file_path = null;
    let file = f.file.files[0];
    let note = '';
    if (file) {
      const small = await compressImage(file); // photos of certificates are made smaller; PDFs unchanged
      if (small.saved) { file = small.file; note = ` Photo made smaller: ${fmtSize(small.before)} → ${fmtSize(small.after)}.`; }
      if (file.size > 25 * 1024 * 1024) { setBusy(false); setMsg({ bad: true, text: 'That file is over 25 MB.' }); return; }
      file_path = `${profileId}/academy-${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
      const { error } = await createClient().storage.from('staff-files').upload(file_path, file, { contentType: file.type || undefined });
      if (error) { setBusy(false); setMsg({ bad: true, text: 'Upload failed: ' + error.message }); return; }
    }
    const res = await addMyTraining({
      title, other_title: f.other_title?.value, completed_on: f.completed_on.value, provider: f.provider.value,
      hours: f.hours.value, expires_on: f.expires_on.value, notes: f.notes.value, file_path,
    });
    setBusy(false);
    if (res?.error) { setMsg({ bad: true, text: res.error }); return; }
    f.reset(); setTitle('');
    setMsg({ bad: false, text: 'Saved. Your manager will verify it and your certificate will appear here.' + note });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card no-print" id="add">
      <h3>Add a training date</h3>
      <div className="row">
        <label>Training
          <select value={title} onChange={(e) => setTitle(e.target.value)} required>
            <option value="" disabled>Choose…</option>
            {trainings.map((t) => <option key={t.key} value={t.title}>{t.title} — {t.program === 'Both' ? 'MCFD & CLBC' : `${t.program} only`}</option>)}
            <option>Other</option>
          </select>
        </label>
        {title === 'Other' && <label>Training name<input name="other_title" required /></label>}
        <label>Date completed<input type="date" name="completed_on" required max={today} /></label>
      </div>
      <div className="row">
        <label>Provider<input name="provider" key={title} defaultValue={match?.provider ?? ''} /></label>
        <label>Hours<input type="number" name="hours" step="0.5" min="0" key={'h' + title} defaultValue={match?.hours ?? ''} /></label>
        <label>Expiry (if on certificate)<input type="date" name="expires_on" />
          <span className="muted small">{match ? (match.renewMonths ? `Blank = renews every ${match.renewMonths === 12 ? 'year' : `${match.renewMonths / 12} years`}` : 'Use the date on your certificate') : 'Blank = renews every year'}</span>
        </label>
      </div>
      <div className="row">
        <label>Certificate file (optional)<input type="file" name="file" accept=".pdf,image/*" /></label>
        <label>Notes<input name="notes" /></label>
      </div>
      <button disabled={busy}>{busy ? 'Saving…' : 'Save training'}</button>
      {msg && <p className={`message ${msg.bad ? '' : 'ok'}`}>{msg.text}</p>}
    </form>
  );
}
