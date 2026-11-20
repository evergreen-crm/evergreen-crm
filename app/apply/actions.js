'use server';
// Online job application (plan B5): everything the applicant's private link does. No portal account:
// the link + a 6-digit email code opens it; the server (service key) does the database work after that check.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { missingFor, flagsFor, highestEducation } from '@/lib/jobs';
import { openApp, sha, cookieName, validToken } from '@/lib/applyAuth';

const codeHash = (token, code) => sha(`ja:${token}:${code}:${adminKey() ?? ''}`);
const emailOk = (e) => typeof e === 'string' && /^[^@\s]{1,100}@[^@\s]{1,100}\.[^@\s]{2,}$/.test(e);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const siteUrl = async () => {
  const h = await headers();
  return process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || `https://${h.get('x-forwarded-host') ?? h.get('host')}`;
};
const ready = () => !!adminKey();

async function issueCode(admin, app) {
  if (app.otp_sent_at && new Date(app.otp_sent_at) > new Date(Date.now() - 60e3)) return { error: 'A code was just sent. Please wait a minute before asking for another.' };
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await admin.from('job_applications').update({ otp_hash: codeHash(app.token, code), otp_sent_at: new Date().toISOString(), otp_expires_at: new Date(Date.now() + 10 * 60e3).toISOString(), otp_attempts: 0 }).eq('id', app.id);
  const link = `${await siteUrl()}/apply/${app.token}`;
  const job = app.posting ? `${app.posting.title} (${app.posting.job_id})` : 'your application';
  const sent = await sendEmail({
    to: app.email,
    subject: `Your Evergreen application code: ${code}`,
    text: `Hello ${app.first_name},\n\nYour code to open your application for ${job} is: ${code}\nIt expires in 10 minutes.\n\nYour private application link (keep it; you can come back to finish later):\n${link}\n\nIf you didn't ask for this, you can ignore this email.\n\nEvergreen Community Care`,
    html: `<div style="font-family:Arial,sans-serif;color:#1d2420;max-width:520px"><p>Hello ${esc(app.first_name)},</p>
      <p>Your code to open your application for <strong>${esc(job)}</strong> is:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0b5a34;margin:16px 0">${code}</p>
      <p>It expires in 10 minutes.</p>
      <p>Your private application link — keep this email so you can come back and finish later:<br><a href="${link}">${link}</a></p>
      <p style="color:#6a736d">If you didn’t ask for this, you can ignore this email.<br>Evergreen Community Care</p></div>`,
  });
  // Test portal only (no real emails): show the code on screen so the whole application can be tried.
  if (sent.error && process.env.NEXT_PUBLIC_APP_ENV === 'test') return { ok: true, testCode: code };
  return sent.error ? { error: sent.error } : { ok: true };
}

// From a job posting: name + email starts (or re-opens) an application and emails a code.
export async function startApplication(fd) {
  const jobId = String(fd.get('job_id') ?? '');
  const back = (m) => redirect(`/jobs/${encodeURIComponent(jobId)}?error=${encodeURIComponent(m)}#apply`);
  if (!ready()) back('Online applications are not switched on yet. Please email Evergreen Community Care.');
  if (fd.get('website')) back('Please try again.');   // hidden field: bots fill it in
  const first = String(fd.get('first') ?? '').trim().slice(0, 80);
  const last = String(fd.get('last') ?? '').trim().slice(0, 80);
  const email = String(fd.get('email') ?? '').trim().toLowerCase().slice(0, 200);
  if (!first || !last) back('Enter your first and last name.');
  if (!emailOk(email)) back('That email address doesn’t look right.');
  const admin = createAdminClient();
  const { data: posting } = await admin.from('job_postings').select('id, job_id, title, status, closing_date').eq('job_id', jobId).maybeSingle();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Etc/GMT+7' }).format(new Date());
  if (!posting || posting.status !== 'Open' || (posting.closing_date && posting.closing_date < today)) back('This job is no longer open for applications.');
  let { data: app } = await admin.from('job_applications').select('*').eq('posting_id', posting.id).ilike('email', email).maybeSingle();
  if (!app) {
    const { data, error } = await admin.from('job_applications').insert({ posting_id: posting.id, first_name: first, last_name: last, email,
      answers: { contact: { first, last, email } } }).select('*').single();
    if (error) back('Could not start the application. Please try again.');
    app = data;
  }
  const r = await issueCode(admin, { ...app, posting });
  redirect(`/apply/${app.token}?${r.error ? `error=${encodeURIComponent(r.error)}` : `sent=1${r.testCode ? `&testcode=${r.testCode}` : ''}`}`);
}

export async function requestCode(token) {
  if (!validToken(token) || !ready()) return { error: 'This link is not valid.' };
  const admin = createAdminClient();
  const { data: app } = await admin.from('job_applications').select('*, posting:posting_id(job_id, title)').eq('token', token).maybeSingle();
  if (!app) return { error: 'This link is not valid.' };
  return issueCode(admin, app);
}

export async function verifyCode(token, code) {
  if (!validToken(token) || !ready()) return { error: 'This link is not valid.' };
  const clean = String(code ?? '').replace(/\D/g, '');
  if (clean.length !== 6) return { error: 'Enter the 6-digit code from the email.' };
  const admin = createAdminClient();
  const { data: app } = await admin.from('job_applications').select('id, token, otp_hash, otp_expires_at, otp_attempts').eq('token', token).maybeSingle();
  if (!app) return { error: 'This link is not valid.' };
  if (!app.otp_hash || new Date(app.otp_expires_at) <= new Date()) return { error: 'That code has expired. Send a new one.' };
  if (app.otp_attempts >= 5) return { error: 'Too many tries. Please send a new code.' };
  if (app.otp_hash !== codeHash(token, clean)) {
    await admin.from('job_applications').update({ otp_attempts: app.otp_attempts + 1 }).eq('id', app.id);
    return { error: 'That code is not right. Please check the email and try again.' };
  }
  const session = randomBytes(32).toString('hex');
  await admin.from('job_applications').update({ session_hash: sha(session), verified_at: new Date().toISOString(), otp_hash: null }).eq('id', app.id);
  (await cookies()).set(cookieName(token), session, { httpOnly: true, secure: true, sameSite: 'lax', path: '/apply', maxAge: 60 * 60 * 24 * 30 });
  return { ok: true };
}

// Save a draft (only while it hasn't been sent).
export async function saveAnswers(token, answers) {
  const o = await openApp(token);
  if (!o) return { error: 'Your session has ended. Open the link from your email again.' };
  if (o.app.status !== 'Draft') return { error: 'This application has already been sent.' };
  const json = JSON.stringify(answers ?? {});
  if (json.length > 150000) return { error: 'The application is too long. Please shorten some answers.' };
  const a = JSON.parse(json);
  const c = a.contact ?? {};
  const { error } = await o.admin.from('job_applications').update({
    answers: a, first_name: String(c.first || o.app.first_name).slice(0, 80), last_name: String(c.last || o.app.last_name || '').slice(0, 80) || null,
    phone: String(c.phone ?? '').slice(0, 40) || null,
  }).eq('id', o.app.id).eq('status', 'Draft');
  return error ? { error: 'Could not save: ' + error.message } : { ok: true, savedAt: new Date().toISOString() };
}

export async function removeFile(token, kind) {
  const o = await openApp(token);
  if (!o || o.app.status !== 'Draft' || !['resume', 'cover'].includes(kind)) return { error: 'Not allowed.' };
  const old = o.app[`${kind}_path`];
  await o.admin.from('job_applications').update({ [`${kind}_path`]: null, [`${kind}_name`]: null }).eq('id', o.app.id);
  if (old) await o.admin.storage.from('applications').remove([old]);
  return { ok: true };
}

export async function submitApplication(token, answers, signedName) {
  const saved = await saveAnswers(token, answers);
  if (saved.error) return saved;
  const o = await openApp(token);
  if (!o) return { error: 'Your session has ended. Open the link from your email again.' };
  const { app } = o;
  const a = app.answers;
  const missing = missingFor(a, app);
  if (missing.length) return { error: 'Please finish: ' + missing.join('; ') };
  const name = String(signedName ?? '').trim();
  const full = `${a.contact.first} ${a.contact.last}`.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!name || name.toLowerCase().replace(/\s+/g, ' ') !== full) return { error: `To sign, type your full name exactly as in Contact information: "${a.contact.first} ${a.contact.last}".` };
  const h = await headers();
  const flags = flagsFor(a, app.posting);
  const final = { ...a, education_highest: highestEducation(a.education) };
  const { data: sentRow, error } = await o.admin.from('job_applications').update({
    answers: final, flags, status: 'New', signed_name: name, submitted_at: new Date().toISOString(),
    signer_ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 64) || null,
  }).eq('id', app.id).eq('status', 'Draft').select('application_no').maybeSingle();
  const appNo = sentRow?.application_no ?? '';
  if (error) return { error: 'Could not send: ' + error.message };
  await o.admin.rpc('notify_hr_jobs', {
    t: `New job application: ${a.contact.first} ${a.contact.last}${appNo ? ` (${appNo})` : ''}`,
    b: `${app.posting?.title ?? ''} (${app.posting?.job_id ?? ''})${flags.length ? ` · ${flags.length} prequalify answer${flags.length === 1 ? '' : 's'} to check` : ''}`,
    l: `/hr/jobs/application/${app.id}`, k: `jobapp:${app.id}`,
  });
  await sendEmail({
    to: app.email,
    subject: `We received your application — ${appNo || app.posting?.job_id || ''}`,
    text: `Hello ${a.contact.first},\n\nThank you for applying for ${app.posting?.title} (Job ID ${app.posting?.job_id}) at Evergreen Community Care. We received your application. Your application number is ${appNo}.\n\nYou can check its status at any time with your private link:\n${await siteUrl()}/apply/${app.token}\n\nEvergreen Community Care — HR`,
    html: `<div style="font-family:Arial,sans-serif;color:#1d2420;max-width:520px"><p>Hello ${esc(a.contact.first)},</p>
      <p>Thank you for applying for <strong>${esc(app.posting?.title)}</strong> (Job ID ${esc(app.posting?.job_id)}) at Evergreen Community Care. We received your application. Your application number is <strong>${esc(appNo)}</strong>.</p>
      <p>You can check its status at any time with your private link:<br><a href="${await siteUrl()}/apply/${app.token}">${await siteUrl()}/apply/${app.token}</a></p>
      <p style="color:#6a736d">Evergreen Community Care — HR</p></div>`,
  });
  return { ok: true };
}

export async function withdrawApplication(token) {
  const o = await openApp(token);
  if (!o) return { error: 'Your session has ended. Open the link from your email again.' };
  if (['Hired', 'Not selected', 'Withdrawn'].includes(o.app.status)) return { error: 'This application is already closed.' };
  await o.admin.from('job_applications').update({ status: 'Withdrawn', decided_at: new Date().toISOString() }).eq('id', o.app.id);
  if (o.app.status !== 'Draft') {
    await o.admin.rpc('notify_hr_jobs', { t: `Application withdrawn: ${o.app.first_name} ${o.app.last_name ?? ''}`, b: o.app.posting?.job_id ?? '', l: `/hr/jobs/application/${o.app.id}`, k: `jobapp-wd:${o.app.id}` });
  }
  return { ok: true };
}
