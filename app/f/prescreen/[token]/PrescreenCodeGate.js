'use client';
// Step 1 before the prescreen: email a 6-digit code to the applicant and check it.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestPrescreenCode, verifyPrescreenCode } from '@/app/f/prescreen/actions';

export default function PrescreenCodeGate({ token, emailHint }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  async function send() {
    setBusy(true); setMsg(null);
    const r = await requestPrescreenCode(token);
    setBusy(false);
    if (r?.error) { setMsg({ bad: true, text: r.error }); return; }
    setSent(true); setMsg({ bad: false, text: `We emailed a 6-digit code to ${emailHint}. Check your inbox (and junk folder).` });
  }
  async function check(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await verifyPrescreenCode(token, code);
    setBusy(false);
    if (r?.error) { setMsg({ bad: true, text: r.error }); return; }
    router.refresh();
  }

  return (
    <div className="card code-gate">
      <h2>🔒 Confirm it’s you</h2>
      <p>To keep your information private, we’ll email a 6-digit code to <strong>{emailHint}</strong>.</p>
      {!sent ? (
        <button className="big-install" onClick={send} disabled={busy}>{busy ? 'Sending…' : '📧 Email me a code'}</button>
      ) : (
        <form onSubmit={check}>
          <label>Enter the code
            <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code}
              onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus />
          </label>
          <button className="big-install" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
          <p className="small"><button type="button" className="link small" onClick={send} disabled={busy}>Send a new code</button></p>
        </form>
      )}
      {msg && <p className={`message ${msg.bad ? '' : 'ok'}`}>{msg.text}</p>}
    </div>
  );
}
