'use client';
// One duty on the shift checklist: ✓ Done · N/A (with a reason) · Problem (with what happened). Big buttons for phones.
import { useState, useTransition } from 'react';
import { tickItem } from './actions';

export default function ChecklistItem({ t, locked, icon }) {
  const [status, setStatus] = useState(t.status);
  const [note, setNote] = useState(t.note ?? '');
  const [asking, setAsking] = useState(null); // 'N/A' | 'Problem'
  const [err, setErr] = useState(null);
  const [busy, start] = useTransition();

  const save = (next, why) => start(async () => {
    setErr(null);
    const prev = status;
    setStatus(next);
    const r = await tickItem({ tickId: t.id, status: next, note: why });
    if (r?.error) { setStatus(prev); setErr(r.error); return; }
    setAsking(null);
  });

  return (
    <li className={`cl-item ${status ? 'is-' + status.replace('/', '').toLowerCase() : ''}${t.critical ? ' crit' : ''}`}>
      <div className="cl-text">
        <span className="cl-area" aria-hidden>{icon}</span>
        <span>{t.item}{t.critical && <strong className="cl-star" title="Safety item"> ⭐</strong>}
          {status && status !== 'Done' && t.note && !asking && <span className="small muted"> — {t.note}</span>}
        </span>
      </div>
      {locked ? (
        <span className={`badge ${status === 'Done' ? '' : status === 'Problem' ? 'bad' : 'warn'}`}>{status === 'Done' ? '✓ Done' : status ?? '—'}</span>
      ) : (
        <div className="cl-btns">
          <button type="button" className={`cl-btn ok${status === 'Done' ? ' on' : ''}`} disabled={busy} onClick={() => save(status === 'Done' ? null : 'Done')}>✓ Done</button>
          {!t.critical && <button type="button" className={`cl-btn na${status === 'N/A' ? ' on' : ''}`} disabled={busy} onClick={() => setAsking(asking === 'N/A' ? null : 'N/A')}>N/A</button>}
          <button type="button" className={`cl-btn bad${status === 'Problem' ? ' on' : ''}`} disabled={busy} onClick={() => setAsking(asking === 'Problem' ? null : 'Problem')}>⚠ Problem</button>
        </div>
      )}
      {asking && (
        <div className="cl-ask">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoFocus
            placeholder={asking === 'N/A' ? 'Why is it not needed today?' : 'What is the problem? What did you do?'} />
          <button type="button" disabled={busy || !note.trim()} onClick={() => save(asking, note)}>Save</button>
          {asking === 'Problem' && t.critical && <p className="small muted" style={{ margin: 0 }}>Your Program Coordinator and Program Manager are alerted. If anyone is hurt, missing or at risk, call on-call now and write an incident report.</p>}
        </div>
      )}
      {err && <p className="message error small" style={{ margin: '6px 0 0' }}>{err}</p>}
    </li>
  );
}
