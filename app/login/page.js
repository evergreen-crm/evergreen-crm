'use client';
// Login with a 6-digit code sent to your email OR cell phone.
// Only people an admin has added can log in (no self sign-up).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [method, setMethod] = useState('email'); // 'email' or 'phone'
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('enter-contact'); // then 'enter-code'
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Phone numbers must look like +16045551234
  function cleanPhone(value) {
    const digits = value.replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) return digits;
    if (digits.length === 10) return '+1' + digits; // Canada / US
    return '+' + digits;
  }

  async function sendCode(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const target = method === 'email' ? { email: contact.trim() } : { phone: cleanPhone(contact) };
    const { error } = await supabase.auth.signInWithOtp({
      ...target,
      options: { shouldCreateUser: false }, // invite-only
    });
    setBusy(false);
    if (error) {
      // Same message whether or not the account exists (don't reveal who has accounts).
      setMessage('We could not send a code. Check what you typed, or ask your manager for access. (Details: ' + error.message + ')');
      return;
    }
    setStep('enter-code');
    setMessage(`We sent a 6-digit code to ${method === 'email' ? 'your email' : 'your phone'}.`);
  }

  async function verifyCode(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const params =
      method === 'email'
        ? { email: contact.trim(), token: code.trim(), type: 'email' }
        : { phone: cleanPhone(contact), token: code.trim(), type: 'sms' };
    const { error } = await supabase.auth.verifyOtp(params);
    setBusy(false);
    if (error) {
      setMessage('That code is wrong or has expired. Try again or send a new code. (Details: ' + error.message + ')');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="login">
      <img src="/logo.png" alt="Evergreen Community Care" className="login-logo" />
      <p className="muted">Sign in with a code sent to your email or cell phone.</p>

      {step === 'enter-contact' && (
        <form onSubmit={sendCode} className="card">
          <div className="tabs">
            <button type="button" className={method === 'email' ? 'on' : ''} onClick={() => setMethod('email')}>
              Email
            </button>
            <button type="button" className={method === 'phone' ? 'on' : ''} onClick={() => setMethod('phone')}>
              Cell phone
            </button>
          </div>
          <label>
            {method === 'email' ? 'Email address' : 'Cell phone number'}
            <input
              type={method === 'email' ? 'email' : 'tel'}
              placeholder={method === 'email' ? 'name@example.com' : '604 555 1234'}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              required
              autoFocus
            />
          </label>
          <button disabled={busy}>{busy ? 'Sending…' : 'Send me a code'}</button>
        </form>
      )}

      {step === 'enter-code' && (
        <form onSubmit={verifyCode} className="card">
          <label>
            6-digit code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
          </label>
          <button disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button type="button" className="link" onClick={() => { setStep('enter-contact'); setCode(''); setMessage(''); }}>
            Use a different email or phone
          </button>
        </form>
      )}

      {message && <p className="message">{message}</p>}
    </main>
  );
}
