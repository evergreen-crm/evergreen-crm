'use server';
// Outside signers (no CRM account): email a 6-digit code, check it, then sign or decline.
// Everything goes through the sign_ext_* database functions, which only the server (secret key) can use.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { plainError } from '@/lib/plain';
import { finishRequest } from '@/lib/signFinish';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const codeHash = (token, code) => sha(`sign:${token}:${code}:${adminKey() ?? ''}`);
const cookieName = (token) => `evg_sg_${token.slice(0, 16)}`;
const validToken = (t) => typeof t === 'string' && /^[0-9a-f]{40,80}$/i.test(t);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function signSessionHash(token) {
  const v = (await cookies()).get(cookieName(token))?.value;
  return v ? sha(v) : null;
}

export async function requestSignCode(token) {
  if (!validToken(token)) return { error: 'This link is not valid.' };
  if (!adminKey() || !process.env.RESEND_API_KEY) return { error: 'Email codes are not switched on yet. Please contact Evergreen Community Care.' };
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const { data, error } = await createAdminClient().rpc('sign_ext_code_issue', { t: token, h: codeHash(token, code) });
  if (error) return { error: 'Could not create a code. Please try again.' };
  if (data?.error === 'wait') return { error: 'A code was just sent. Please wait a minute before asking for another.' };
  if (data?.error) return { error: 'This link can’t be used. Please contact Evergreen Community Care.' };
  const sent = await sendEmail({
    to: data.email, subject: `Your Evergreen code: ${code}`,
    text: `Hello ${data.name},\n\nYour code to open "${data.title}" from Evergreen Community Care is: ${code}\n\nIt expires in 10 minutes. If you didn't ask for this, you can ignore this email.\n\nEvergreen Community Care`,
    html: `<div style="font-family:Arial,sans-serif;color:#1d2420;max-width:480px">
      <p>Hello ${esc(data.name)},</p>
      <p>Your code to open <strong>${esc(data.title)}</strong> from Evergreen Community Care is:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0b5a34;margin:16px 0">${code}</p>
      <p>It expires in 10 minutes. If you didn’t ask for this, you can ignore this email.</p>
      <p style="color:#6a736d">Evergreen Community Care</p></div>`,
  });
  if (sent.error) return { error: sent.error };
  return { ok: true };
}

export async function verifySignCode(token, code) {
  if (!validToken(token)) return { error: 'This link is not valid.' };
  const clean = String(code ?? '').replace(/\D/g, '');
  if (clean.length !== 6) return { error: 'Enter the 6-digit code from the email.' };
  const session = randomBytes(32).toString('hex');
  const { data, error } = await createAdminClient().rpc('sign_ext_code_verify', { t: token, h: codeHash(token, clean), sess: sha(session) });
  if (error) return { error: 'Could not check the code. Please try again.' };
  const msg = { wrong: 'That code is not right. Please check the email and try again.', expired: 'That code has expired. Send a new one.',
    locked: 'Too many tries. Please send a new code.', invalid: 'This link can’t be used. Please contact Evergreen Community Care.' }[data];
  if (msg) return { error: msg };
  (await cookies()).set(cookieName(token), session, { httpOnly: true, secure: true, sameSite: 'lax', path: '/f/sign', maxAge: 60 * 60 * 24 * 30 });
  return { ok: true };
}

async function who() {
  const h = await headers();
  return { ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || '', agent: (h.get('user-agent') ?? '').slice(0, 300) };
}

export async function signOutside(token, { name, image, values } = {}) {
  if (!validToken(token)) return { error: 'This link is not valid.' };
  const sess = await signSessionHash(token);
  if (!sess) return { error: 'Please confirm the code from your email again (reload this page).' };
  const { ip, agent } = await who();
  const { data, error } = await createAdminClient().rpc('sign_ext_sign', {
    t: token, sess, p_name: String(name ?? '').slice(0, 120), p_image: typeof image === 'string' ? image : null,
    p_values: values && typeof values === 'object' && !Array.isArray(values) ? values : {}, p_agent: agent, p_ip: ip,
  });
  if (error) return { error: plainError(error.message) };
  if (data?.completed) await finishRequest(data.request);
  return { ok: true };
}

export async function declineOutside(token, reason) {
  if (!validToken(token)) return { error: 'This link is not valid.' };
  const sess = await signSessionHash(token);
  if (!sess) return { error: 'Please confirm the code from your email again (reload this page).' };
  const { data, error } = await createAdminClient().rpc('sign_ext_decline', { t: token, sess, p_reason: String(reason ?? '').slice(0, 1000) });
  if (error) return { error: plainError(error.message) };
  if (data?.completed) await finishRequest(data.request);
  return { ok: true };
}
