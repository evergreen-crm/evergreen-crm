'use server';
// Public intake form: email code check, then fill in and sign (no account needed).
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { formByKey } from '@/lib/intakeForms';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const codeHash = (token, code) => sha(`${token}:${code}:${adminKey() ?? ''}`);
const cookieName = (token) => `evg_if_${token.slice(0, 16)}`;
const validToken = (t) => typeof t === 'string' && /^[0-9a-f]{40,80}$/i.test(t);

export async function sessionHashFor(token) {
  const v = (await cookies()).get(cookieName(token))?.value;
  return v ? sha(v) : null;
}

export async function requestCode(token) {
  if (!validToken(token)) return { error: 'This link is not valid.' };
  if (!adminKey() || !process.env.RESEND_API_KEY) {
    return { error: 'Email codes are not switched on yet. Please contact Evergreen Community Care.' };
  }
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('intake_code_issue', { t: token, h: codeHash(token, code) });
  if (error) return { error: 'Could not create a code: ' + error.message };
  if (data?.error === 'wait') return { error: 'A code was just sent. Please wait a minute before asking for another.' };
  if (data?.error) return { error: 'This link can’t be used. Please contact Evergreen Community Care.' };
  const subject = `Your Evergreen verification code: ${code}`;
  const text = `Hello ${data.name},\n\nYour code to open "${data.form}" is: ${code}\n\nIt expires in 10 minutes. If you didn't ask for this, you can ignore this email.\n\nEvergreen Community Care`;
  const html = `<div style="font-family:Arial,sans-serif;color:#1d2420;max-width:480px">
    <p>Hello ${escapeHtml(data.name)},</p>
    <p>Your code to open <strong>${escapeHtml(data.form)}</strong> is:</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0b5a34;margin:16px 0">${code}</p>
    <p>It expires in 10 minutes. If you didn’t ask for this, you can ignore this email.</p>
    <p style="color:#6a736d">Evergreen Community Care</p></div>`;
  const sent = await sendEmail({ to: data.email, subject, html, text });
  if (sent.error) return { error: sent.error };
  return { ok: true };
}

export async function verifyCode(token, code) {
  if (!validToken(token)) return { error: 'This link is not valid.' };
  const clean = String(code ?? '').replace(/\D/g, '');
  if (clean.length !== 6) return { error: 'Enter the 6-digit code from the email.' };
  const session = randomBytes(32).toString('hex');
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('intake_code_verify', { t: token, h: codeHash(token, clean), sess: sha(session) });
  if (error) return { error: 'Could not check the code: ' + error.message };
  const msg = { wrong: 'That code is not right. Please check the email and try again.', expired: 'That code has expired. Send a new one.',
    locked: 'Too many tries. Please send a new code.', invalid: 'This link can’t be used. Please contact Evergreen Community Care.' }[data];
  if (msg) return { error: msg };
  (await cookies()).set(cookieName(token), session, { httpOnly: true, secure: true, sameSite: 'lax', path: '/f', maxAge: 60 * 60 * 24 * 21 });
  return { ok: true };
}

export async function submitIntake(token, formKey, answers, signedName, signerRole, signature) {
  const form = formByKey(formKey);
  if (!form || !validToken(token)) return { error: 'This form could not be found.' };
  const clean = {};
  const missing = [];
  for (const s of form.sections) for (const f of s.fields) {
    let v = answers?.[f.name];
    if (f.type === 'check') v = v === true || v === 'on' || v === 'true';
    else v = typeof v === 'string' ? v.trim().slice(0, 5000) : '';
    if (f.required && !v) missing.push(f.label);
    clean[f.name] = v;
  }
  if (missing.length) return { error: 'Please complete: ' + missing.slice(0, 5).join(', ') + (missing.length > 5 ? '…' : '') };
  if (!signedName?.trim()) return { error: 'Please type your full name to sign.' };
  if (!signature?.startsWith('data:image/png;base64,')) return { error: 'Please draw your signature in the box.' };

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || '';
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('intake_submit', {
    t: token, answers: clean, sname: signedName.trim().slice(0, 120), srole: (signerRole ?? '').slice(0, 80),
    sig: signature, ip, agent: h.get('user-agent') ?? '', sess: await sessionHashFor(token),
  });
  if (error) return { error: 'Could not save: ' + error.message };
  const msg = { already: 'This form was already signed.', cancelled: 'This link was cancelled. Please contact Evergreen.',
    expired: 'This link has expired. Please ask Evergreen for a new one.', not_found: 'This link is not valid.',
    unverified: 'Please confirm the email code again (reload this page).',
    unsigned: 'Please type your name and draw your signature.', too_large: 'The form is too large — please shorten your answers.' }[data];
  if (msg) return { error: msg };
  return { ok: true };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
