'use client';
// For the sender (and managers at the house, or level 6+): remind the people who haven't answered, or cancel.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { remindSigners, cancelRequest, remakeFinished } from '@/app/sign/actions';

export default function SenderTools({ id, waiting, canCancel, open = true, remake = false }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const router = useRouter();

  async function remind() {
    setBusy(true); setMsg(null);
    const res = await remindSigners(id);
    setBusy(false);
    setMsg(res?.error ? { bad: true, text: res.error } : { bad: false, text: res.count ? `Reminder sent to ${res.count} ${res.count === 1 ? 'person' : 'people'} (outside people by email).${res.failed?.length ? ` Email failed for: ${res.failed.join(', ')}.` : ''}` : 'Everyone waiting was already reminded in the last day.' });
    router.refresh();
  }
  async function cancel() {
    setBusy(true); setMsg(null);
    const res = await cancelRequest({ id, reason });
    setBusy(false);
    if (res?.error) { setMsg({ bad: true, text: res.error }); return; }
    router.refresh();
  }
  async function rebuild() {
    setBusy(true); setMsg(null);
    const res = await remakeFinished(id);
    setBusy(false);
    setMsg(res?.error ? { bad: true, text: res.error } : { bad: false, text: 'The finished PDF is ready.' });
    router.refresh();
  }
  if (!open) {
    return remake ? (
      <section className="card no-print">
        <p className="small">The finished PDF wasn’t made yet.</p>
        <button type="button" onClick={rebuild} disabled={busy}>{busy ? 'Making it…' : '📄 Make the finished PDF'}</button>
        {msg && <p className={`message ${msg.bad ? 'error' : 'ok'}`}>{msg.text}</p>}
      </section>
    ) : null;
  }
  return (
    <section className="card no-print">
      <h2>Follow up</h2>
      <div className="row" style={{ alignItems: 'center' }}>
        <button type="button" onClick={remind} disabled={busy || !waiting}>⏰ Remind the {waiting} still waiting</button>
        {canCancel && !cancelling && <button type="button" className="secondary" onClick={() => setCancelling(true)} disabled={busy}>Cancel this request</button>}
      </div>
      {cancelling && (
        <div className="row" style={{ marginTop: 8 }}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (e.g., sent the wrong version)" />
          <button type="button" onClick={cancel} disabled={busy}>Yes, cancel it</button>
          <button type="button" className="link" onClick={() => setCancelling(false)}>Keep it</button>
        </div>
      )}
      <p className="muted small">Reminders go out at most once a day per person. Signatures already given are kept even if you cancel.</p>
      {msg && <p className={`message ${msg.bad ? 'error' : 'ok'}`}>{msg.text}</p>}
    </section>
  );
}
