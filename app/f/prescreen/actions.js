'use server';
// Public prescreen form: email code check, then fill in and sign (no account needed).
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { validateApplication, SELF } from '@/lib/prescreen';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const codeHash = (token, code) => sha(`prescreen:${token}:${code}:${adminKey() ?? ''}`);
const cookieName = (token) => `evg_ps_${token.slice(0, 16)}`;
const validToken = (t) => typeof t === 'string' && /^[0-9a-f]{40,80}$/i.test(t);
const str = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function sessionHashFor(token) {
  const v = (await cookies()).get(cookieName(token))?.value;
  return v ? sha(v) : null;
}

export async function requestPrescreenCode(token) {
  if (!validToken(token)) return { error: 'This link is not valid.' };
  if (!adminKey() || !process.env.RESEND_API_KEY) {
    return { error: 'Email codes are not switched on yet. Please contact Evergreen Community Care.' };
  }
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const { data, error } = await createAdminClient().rpc('prescreen_code_issue', { t: token, h: codeHash(token, code) });
  if (error) return { error: 'Could not create a code: ' + error.message };
  if (data?.error === 'wait') return { error: 'A code was just sent. Please wait a minute before asking for another.' };
  if (data?.error) return { error: 'This link can’t be used. Please contact Evergreen Community Care.' };
  const subject = `Your Evergreen verification code: ${code}`;
  const text = `Hello ${data.name},\n\nYour code to open your Evergreen Community Care employment prescreen is: ${code}\n\nIt expires in 10 minutes. If you didn't ask for this, you can ignore this email.\n\nEvergreen Community Care`;
  const html = `<div style="font-family:Arial,sans-serif;color:#1d2420;max-width:480px">
    <p>Hello ${escapeHtml(data.name)},</p>
    <p>Your code to open your <strong>Evergreen Community Care employment prescreen</strong> is:</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0b5a34;margin:16px 0">${code}</p>
    <p>It expires in 10 minutes. If you didn’t ask for this, you can ignore this email.</p>
    <p style="color:#6a736d">Evergreen Community Care</p></div>`;
  const sent = await sendEmail({ to: data.email, subject, html, text });
  if (sent.error) return { error: sent.error };
  return { ok: true };
}

export async function verifyPrescreenCode(token, code) {
  if (!validToken(token)) return { error: 'This link is not valid.' };
  const clean = String(code ?? '').replace(/\D/g, '');
  if (clean.length !== 6) return { error: 'Enter the 6-digit code from the email.' };
  const session = randomBytes(32).toString('hex');
  const { data, error } = await createAdminClient().rpc('prescreen_code_verify', { t: token, h: codeHash(token, clean), sess: sha(session) });
  if (error) return { error: 'Could not check the code: ' + error.message };
  const msg = { wrong: 'That code is not right. Please check the email and try again.', expired: 'That code has expired. Send a new one.',
    locked: 'Too many tries. Please send a new code.', invalid: 'This link can’t be used. Please contact Evergreen Community Care.' }[data];
  if (msg) return { error: msg };
  (await cookies()).set(cookieName(token), session, { httpOnly: true, secure: true, sameSite: 'lax', path: '/f', maxAge: 60 * 60 * 24 * 30 });
  return { ok: true };
}

// Keep only the fields we expect, trimmed, so nothing else can be stored.
function cleanApplication(a = {}) {
  const ap = a.applicant ?? {}, sc = a.screen ?? {}, ex = a.experience ?? {};
  const list = (v, n = 12) => (Array.isArray(v) ? v.slice(0, n).map((x) => str(x, 80)) : []);
  return {
    applicant: { first: str(ap.first, 80), last: str(ap.last, 80), dob: str(ap.dob, 10), phone: str(ap.phone, 40), email: str(ap.email, 120).toLowerCase(),
      address: str(ap.address, 250), position: str(ap.position, 80), type: str(ap.type, 40), program: str(ap.program, 10), start: str(ap.start, 10), avail: list(ap.avail) },
    screen: { drive: str(sc.drive, 3), outside: str(sc.outside, 3), where: str(sc.where, 300), coi: str(sc.coi, 3), coiDetail: str(sc.coiDetail, 1500) },
    experience: { years: str(ex.years, 40), pops: list(ex.pops), summary: str(ex.summary, 5000), other: str(ex.other, 2000),
      roles: [0, 1].map((i) => { const r = ex.roles?.[i] ?? {}; return { employer: str(r.employer, 120), title: str(r.title, 120), from: str(r.from, 7), to: str(r.to, 7), duties: str(r.duties, 1500) }; }) },
    self: Object.fromEntries(SELF.map((s) => [s.k, { has: str(a.self?.[s.k]?.has, 10), exp: str(a.self?.[s.k]?.exp, 10) }])),
    refs: [0, 1, 2].map((i) => { const r = a.refs?.[i] ?? {}; return { name: str(r.name, 120), title: str(r.title, 120), org: str(r.org, 160), rel: str(r.rel, 60), phone: str(r.phone, 40), email: str(r.email, 120), years: str(r.years, 40) }; }),
    consent: { truthful: a.consent?.truthful === true, verify: a.consent?.verify === true, screening: a.consent?.screening === true },
  };
}

export async function submitPrescreen(token, answers, signedName, signature) {
  if (!validToken(token)) return { error: 'This link is not valid.' };
  const clean = cleanApplication(answers);
  const errs = validateApplication(clean, signedName, signature);
  if (errs.length) return { error: errs.join(' ') };
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || '';
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('prescreen_submit', {
    t: token, answers: clean, sname: signedName.trim().slice(0, 120), sig: signature, ip, agent: h.get('user-agent') ?? '',
    sess: await sessionHashFor(token),
  });
  if (error) return { error: 'Could not save: ' + error.message };
  const msg = { already: 'This prescreen was already signed.', cancelled: 'This link was cancelled. Please contact Evergreen.',
    expired: 'This link has expired. Please ask Evergreen for a new one.', not_found: 'This link is not valid.',
    unverified: 'Please confirm the email code again (reload this page).',
    unsigned: 'Please type your name and draw your signature.', too_large: 'The form is too large. Please shorten your answers.' }[data];
  if (msg) return { error: msg };
  return { ok: true };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
