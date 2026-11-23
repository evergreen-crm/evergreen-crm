// 📨 Applicant reminders (daily job, Nov 23 2026): a nudge to people who started a job application on the Careers
// page or a pre-screen from HR, but stopped. supabase/applicant-reminders.sql
//   Careers application (Draft, email confirmed with the code): up to 3 — after 2 quiet days, after 5 more,
//   then 3 days before the posting closes (or 14 days later if it has no closing date).
//   Pre-screen (link Sent or Opened, not expired): up to 2 — after 3 quiet days, then 3 days before the link
//   ends (or 7 days later).
// "Quiet" means the applicant hasn't saved anything since the last email. Nothing is sent once they send it,
// withdraw, the job closes or the link ends.
import 'server-only';
import { sendEmail, emailReady } from '@/lib/email';
import { emailPrescreenLink } from '@/lib/prescreenLink';
import { fmtDate } from '@/lib/options';

const DAY = 86400e3;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (iso, now) => (iso ? (now - new Date(iso).getTime()) / DAY : Infinity);
const until = (iso, now) => (iso ? (new Date(iso).getTime() - now) / DAY : Infinity);

// Which Careers drafts are due today (pure: easy to check by hand).
export function appDue(a, now, today) {
  const p = a.posting;
  if (a.status !== 'Draft' || !a.verified_at || !a.email || (a.reminders_sent ?? 0) >= 3) return false;
  if (!p || p.status !== 'Open' || (p.closing_date && p.closing_date < today)) return false;
  // Every update stamps updated_at, including our own reminder; activity after the reminder means they came back.
  const remindedMs = a.last_reminded_at ? new Date(a.last_reminded_at).getTime() : 0;
  const quietSince = remindedMs && new Date(a.updated_at).getTime() <= remindedMs + 120e3 ? a.last_reminded_at : a.updated_at;
  const quiet = ago(quietSince, now);
  const n = a.reminders_sent ?? 0;
  if (n === 0) return quiet >= 2;
  if (n === 1) return quiet >= 5;
  const closesIn = p.closing_date ? until(p.closing_date + 'T23:59:00-07:00', now) : Infinity;
  return (closesIn <= 3 && quiet >= 1) || quiet >= 14;
}

export function prescreenDue(p, now) {
  if (!['Sent', 'Opened'].includes(p.link_status) || !p.email || !p.link_emailed_at || (p.reminders_sent ?? 0) >= 2) return false;
  if (p.expires_at && new Date(p.expires_at).getTime() <= now) return false;
  const last = [p.link_emailed_at, p.opened_at, p.draft_saved_at, p.last_reminded_at].filter(Boolean).map((x) => new Date(x).getTime());
  const quiet = (now - Math.max(...last)) / DAY;
  if ((p.reminders_sent ?? 0) === 0) return quiet >= 3;
  return (until(p.expires_at, now) <= 3 && quiet >= 1) || quiet >= 7;
}

async function emailAppReminder(app, site) {
  const link = `${site}/apply/${app.token}`;
  const job = `${app.posting.title} (${app.posting.job_id})`;
  const closes = app.posting.closing_date ? `Applications close on ${fmtDate(app.posting.closing_date)}.` : '';
  const last = (app.reminders_sent ?? 0) >= 2;
  const subject = last ? `Last reminder: your Evergreen application for ${app.posting.title}` : `Your Evergreen application isn’t sent yet — ${app.posting.title}`;
  const text = `Hello ${app.first_name},\n\nYou started an application for ${job} with Evergreen Community Care, but it hasn’t been sent yet. Everything you entered is saved.\n\nOpen your application to finish it (we’ll email you a new 6-digit code):\n${link}\n\n${closes}\nIf you’ve changed your mind, open the link and choose “Withdraw”, and we won’t remind you again.${last ? ' This is the last reminder.' : ''}\n\nEvergreen Community Care — HR`;
  const html = `<div style="font-family:Arial,sans-serif;color:#1d2420;max-width:560px;line-height:1.5">
    <p>Hello ${esc(app.first_name)},</p>
    <p>You started an application for <strong>${esc(job)}</strong> with Evergreen Community Care, but it hasn’t been sent yet. Everything you entered is saved.</p>
    <p style="margin:22px 0"><a href="${link}" style="background:#0b5a34;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Finish my application</a></p>
    <p style="font-size:13px">We’ll email you a new 6-digit code when you open it. ${esc(closes)}</p>
    <p style="font-size:12px;color:#6a736d">If you’ve changed your mind, open the link and choose “Withdraw”, and we won’t remind you again.${last ? ' This is the last reminder.' : ''}<br>If the button doesn’t work, copy this link: ${link}<br>Evergreen Community Care — HR</p></div>`;
  return sendEmail({ to: app.email, subject, html, text });
}

export async function runApplicantReminders(admin, { today, site }) {
  const now = Date.now();
  const out = { apps: 0, prescreens: 0, errors: [], due: 0 };
  const [{ data: apps, error: e1 }, { data: pss, error: e2 }] = await Promise.all([
    admin.from('job_applications').select('id, first_name, email, token, status, verified_at, updated_at, reminders_sent, last_reminded_at, posting:posting_id(job_id, title, status, closing_date)')
      .eq('status', 'Draft').not('verified_at', 'is', null).lt('reminders_sent', 3),
    admin.from('prescreens').select('id, email, link_status, link_emailed_at, opened_at, draft_saved_at, expires_at, reminders_sent, last_reminded_at')
      .in('link_status', ['Sent', 'Opened']).not('link_emailed_at', 'is', null).lt('reminders_sent', 2),
  ]);
  if (e1 || e2) { out.errors.push((e1 ?? e2).message); return out; }
  const dueApps = (apps ?? []).filter((a) => appDue(a, now, today));
  const duePs = (pss ?? []).filter((p) => prescreenDue(p, now));
  out.due = dueApps.length + duePs.length;
  if (!emailReady()) { out.errors.push('Email sending is not set up; nothing sent.'); return out; }
  for (const a of dueApps.slice(0, 40)) {
    const r = await emailAppReminder(a, site);
    if (r.error) { out.errors.push(`${a.email}: ${r.error}`); continue; }
    await admin.from('job_applications').update({ reminders_sent: (a.reminders_sent ?? 0) + 1, last_reminded_at: new Date().toISOString() }).eq('id', a.id).eq('status', 'Draft');
    out.apps++;
    await new Promise((r2) => setTimeout(r2, 600));
  }
  for (const p of duePs.slice(0, 40)) {
    const r = await emailPrescreenLink(admin, p.id, { reminder: (p.reminders_sent ?? 0) + 1 });
    if (r.error) { out.errors.push(`${p.email}: ${r.error}`); continue; }
    await admin.from('prescreens').update({ reminders_sent: (p.reminders_sent ?? 0) + 1, last_reminded_at: new Date().toISOString() }).eq('id', p.id);
    out.prescreens++;
    await new Promise((r2) => setTimeout(r2, 600));
  }
  return out;
}
