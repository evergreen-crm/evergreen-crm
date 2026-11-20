'use client';
// Open the private application link: check the 6-digit code that was emailed.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestCode, verifyCode } from '@/app/apply/actions';

export default function CodeGate({ token, emailHint, justSent, testCode: firstTestCode }) {
  const [testCode, setTestCode] = useState(firstTestCode);
  const [sent, setSent] = useState(!!justSent);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(justSent ? { bad: false, text: `We emailed a 6-digit code to ${emailHint}. Check your inbox (and junk folder).` } : null);
  const router = useRouter();

  async function send() {
    setBusy(true); setMsg(null);
    const r = await requestCode(token);
    setBusy(false);
    if (r?.error) { setMsg({ bad: true, text: r.error }); return; }
    if (r?.testCode) setTestCode(r.testCode);
    setSent(true); setMsg({ bad: false, text: `We emailed a 6-digit code to ${emailHint}. Check your inbox (and junk folder).` });
  }
  async function check(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await verifyCode(token, code);
    setBusy(false);
    if (r?.error) { setMsg({ bad: true, text: r.error }); return; }
    router.refresh();
  }

  return (
    <div className="card code-gate">
      <h2>🔒 Confirm it’s you</h2>
      <p>To keep your application private, enter the 6-digit code we email to <strong>{emailHint}</strong>.</p>
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
      {testCode && <p className="message"><strong>TEST PORTAL:</strong> no real emails are sent here, so your code is shown instead: <strong>{testCode}</strong></p>}
    </div>
  );
}
