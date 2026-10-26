// Nightly survey and monthly-review work (called from the daily job in lib/automation.js).
//  1. Creates the surveys that are due (3 / 6 / every 6 months after admission, discharge, 90 days after hire,
//     yearly for staff, 7 days after an application, 14 days after an intake form) and emails the link.
//     Youth surveys are done in person: the house's Program Coordinator gets a to-do instead of an email.
//  2. Reminds people who haven't answered (after 7 and 14 days) and closes links after 30 days.
//  3. Monthly QA review: on the 1st, every PC (own house), PM and director gets a to-do; from the 10th,
//     anyone who hasn't done last month's review is reminded and the directors see who is missing.
// Nothing is sent twice: each survey has a dedupe key and each alert a notification key.
import 'server-only';
import { sendEmail, emailReady } from '@/lib/email';
import { SURVEYS, residentMilestone, NO_REPEAT_DAYS } from '@/lib/surveys';
import { levelOf, groupOf } from '@/lib/levels';
import { addDaysISO, fmtDate } from '@/lib/options';

const REVIEW_START = '2026-10-01';
const SITE = (process.env.SITE_URL || 'https://evergreen-crm-azure.vercel.app').replace(/\/$/, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const days = (a, b) => Math.round((new Date(b.slice(0, 10) + 'T12:00:00Z') - new Date(a.slice(0, 10) + 'T12:00:00Z')) / 86400000);
const okEmail = (e) => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());
const resName = (r) => `${r.preferred_name || r.first_name} ${r.last_name ?? ''}`.trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const monthName = (iso) => new Date(iso.slice(0, 7) + '-15T12:00:00Z').toLocaleString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function surveyEmail(s, reminder) {
  const def = SURVEYS[s.survey_key];
  const link = `${SITE}/f/survey/${s.token}`;
  const about = s.about ? ` about ${s.about}` : '';
  const subject = `${reminder ? 'Reminder: ' : ''}${def.title} — Evergreen Community Care`;
  const html = `<div style="font-family:Arial,sans-serif;color:#1d2420;max-width:540px;line-height:1.45">
    <p>Hello${s.recipient_name ? ' ' + esc(s.recipient_name) : ''},</p>
    <p>${reminder ? 'We would still love to hear from you. ' : ''}Evergreen Community Care asks for feedback${esc(about)} regularly, to keep improving our services (COA accreditation standards).
    It takes about 3 minutes${['staff', 'new_hire', 'first_week'].includes(s.survey_key) ? ' and is confidential' : ''}.</p>
    <p style="margin:22px 0"><a href="${link}" style="background:#0b5a34;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Answer the survey</a></p>
    <p style="font-size:12px;color:#6a736d">The link works until ${fmtDate(String(s.expires_at).slice(0, 10))}. If the button doesn't work, copy this link: ${link}</p>
    <p style="font-size:12px;color:#6a736d">Evergreen Community Care Inc.</p></div>`;
  const text = `Hello${s.recipient_name ? ' ' + s.recipient_name : ''},\n\nEvergreen Community Care asks for feedback${about} to keep improving our services. It takes about 3 minutes.\n\n${link}\n\nThe link works until ${fmtDate(String(s.expires_at).slice(0, 10))}.`;
  return { subject, html, text };
}

export async function runSurveyJob(admin, { today, people, notifyOnce }) {
  const out = { created: 0, emailed: 0, reminded: 0, expired: 0, reviewAlerts: 0, errors: [] };
  const want = [];
  const add = (row) => want.push({ status: 'Sent', ...row });

  // ---- 1. Which surveys are due ----
  const [{ data: residents }, { data: details }, { data: apps }, { data: intakes }] = await Promise.all([
    admin.from('residents').select('id, home_id, first_name, last_name, preferred_name, status, admission_date, discharge_date, guardian_name, guardian_email, case_worker_name, case_worker_email, funder_contact_name, funder_contact_email'),
    admin.from('staff_details').select('profile_id, hire_date'),
    admin.from('prescreens').select('id, first_name, last_name, email, signed_at').not('signed_at', 'is', null).gte('signed_at', addDaysISO(today, -30)),
    admin.from('intake_requests').select('id, case_id, recipient_name, recipient_email, completed_at, intake_cases(home_id)').not('completed_at', 'is', null).gte('completed_at', addDaysISO(today, -45)),
  ]);
  for (const r of residents ?? []) {
    let occasion = null;
    if (r.status === 'discharged') { if (r.discharge_date && days(r.discharge_date, today) >= 0 && days(r.discharge_date, today) <= 30) occasion = 'discharge'; }
    else {
      occasion = residentMilestone(r.admission_date, today)?.label ?? null;
      // 30-day "settling in" check (youth in person + guardian), between day 30 and day 45 after admission.
      if (!occasion && r.admission_date && days(r.admission_date, today) >= 30 && days(r.admission_date, today) <= 45) occasion = '30-day';
    }
    if (!occasion) continue;
    const base = { resident_id: r.id, home_id: r.home_id, reason: occasion };
    if (occasion === '30-day') {
      add({ ...base, survey_key: 'youth', dedupe_key: `youth:${r.id}:30-day`, recipient_name: resName(r), status: 'Waiting' });
      if (okEmail(r.guardian_email)) add({ ...base, survey_key: 'family', dedupe_key: `family:${r.id}:30-day`, recipient_name: r.guardian_name, recipient_email: r.guardian_email.trim().toLowerCase(), about: resName(r) });
      continue;
    }
    if (occasion !== 'discharge') add({ ...base, survey_key: 'youth', dedupe_key: `youth:${r.id}:${occasion}`, recipient_name: resName(r), status: 'Waiting' });
    if (okEmail(r.guardian_email)) add({ ...base, survey_key: 'family', dedupe_key: `family:${r.id}:${occasion}`, recipient_name: r.guardian_name, recipient_email: r.guardian_email.trim().toLowerCase(), about: resName(r) });
    if (okEmail(r.case_worker_email)) add({ ...base, survey_key: 'social_worker', dedupe_key: `sw:${r.id}:${occasion}:${r.case_worker_email.trim().toLowerCase()}`, recipient_name: r.case_worker_name, recipient_email: r.case_worker_email.trim().toLowerCase(), about: resName(r) });
    if (okEmail(r.funder_contact_email)) add({ ...base, survey_key: 'funder', dedupe_key: `funder:${r.id}:${occasion}:${r.funder_contact_email.trim().toLowerCase()}`, recipient_name: r.funder_contact_name, recipient_email: r.funder_contact_email.trim().toLowerCase(), about: resName(r) });
  }
  const hire = Object.fromEntries((details ?? []).map((d) => [d.profile_id, d.hire_date]));
  for (const p of people.filter((x) => x.role !== 'admin' && !groupOf(x) && levelOf(x) <= 7 && okEmail(x.email))) {
    const h = hire[p.id]; if (!h) continue;
    const since = days(h, today);
    if (since >= 7 && since <= 14) add({ survey_key: 'first_week', reason: 'first week', dedupe_key: `first_week:${p.id}`, profile_id: p.id, home_id: p.home_id, recipient_name: p.full_name, recipient_email: p.email });
    if (since >= 90 && since <= 120) add({ survey_key: 'new_hire', reason: '90-day', dedupe_key: `new_hire:${p.id}`, profile_id: p.id, home_id: p.home_id, recipient_name: p.full_name, recipient_email: p.email });
    const years = Math.floor(since / 365.25);
    const anniv = addDaysISO(h, Math.round(years * 365.25));
    if (years >= 1 && days(anniv, today) >= 0 && days(anniv, today) <= 30) add({ survey_key: 'staff', reason: 'annual', dedupe_key: `staff:${p.id}:${years}`, profile_id: p.id, home_id: p.home_id, recipient_name: p.full_name, recipient_email: p.email });
  }
  for (const a of apps ?? []) {
    if (!okEmail(a.email) || days(a.signed_at, today) < 7) continue;
    add({ survey_key: 'applicant', reason: 'hiring', dedupe_key: `applicant:${a.id}`, recipient_name: `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim(), recipient_email: a.email.trim().toLowerCase() });
  }
  for (const q of intakes ?? []) {
    if (!okEmail(q.recipient_email) || days(q.completed_at, today) < 14) continue;
    add({ survey_key: 'referral', reason: 'intake', dedupe_key: `referral:${q.case_id}:${q.recipient_email.trim().toLowerCase()}`, home_id: q.intake_cases?.home_id ?? null, recipient_name: q.recipient_name, recipient_email: q.recipient_email.trim().toLowerCase() });
  }

  // No survey fatigue: skip anyone (same email, or same youth for in-person surveys) who already got a survey
  // in the last 30 days. They are picked up on a later night while the occasion is still open.
  if (want.length) {
    const [{ data: recent }, { data: existing }] = await Promise.all([
      admin.from('survey_sends').select('survey_key, recipient_email, resident_id').gte('created_at', addDaysISO(today, -NO_REPEAT_DAYS)).neq('status', 'Cancelled'),
      admin.from('survey_sends').select('dedupe_key').in('dedupe_key', want.map((w) => w.dedupe_key)),
    ]);
    const have = new Set((existing ?? []).map((e) => e.dedupe_key));
    const busyEmail = new Set((recent ?? []).map((r) => (r.recipient_email ?? '').toLowerCase()).filter(Boolean));
    const busyYouth = new Set((recent ?? []).filter((r) => r.survey_key === 'youth').map((r) => r.resident_id));
    const keep = [];
    for (const w of want) {
      if (have.has(w.dedupe_key)) continue;
      const busy = w.survey_key === 'youth' ? busyYouth.has(w.resident_id) : w.recipient_email && busyEmail.has(w.recipient_email);
      if (busy) { out.skippedRecent = (out.skippedRecent ?? 0) + 1; continue; }
      keep.push(w);
      if (w.survey_key === 'youth') busyYouth.add(w.resident_id); else if (w.recipient_email) busyEmail.add(w.recipient_email);
    }
    want.length = 0; want.push(...keep);
  }

  // Insert the new ones only (existing dedupe keys are left alone).
  const about = Object.fromEntries(want.map((w) => [w.dedupe_key, w.about]));
  const rows = want.map(({ about: _a, ...w }) => ({ ...w, sent_at: w.status === 'Sent' ? new Date().toISOString() : null }));
  let created = [];
  if (rows.length) {
    const { data, error } = await admin.from('survey_sends').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id, survey_key, token, recipient_name, recipient_email, expires_at, status, home_id, resident_id, dedupe_key');
    if (error) { out.errors.push('Create surveys: ' + error.message); return out; }
    created = data ?? [];
  }
  out.created = created.length;
  for (const s of created) {
    if (s.status === 'Sent' && s.recipient_email && emailReady()) {
      const r = await sendEmail({ to: s.recipient_email, ...surveyEmail({ ...s, about: about[s.dedupe_key] }, false) });
      if (r.error) out.errors.push(`${s.recipient_email}: ${r.error}`); else out.emailed++;
      await sleep(600);
    }
    if (s.survey_key === 'youth') {
      // In person: tell the house's Program Coordinator(s).
      for (const pc of people.filter((p) => levelOf(p) === 2 && !groupOf(p) && p.home_id && p.home_id === s.home_id)) {
        await notifyOnce(pc, `youth-survey:${s.id}:${pc.id}`, `📋 Do the youth survey with ${s.recipient_name}`,
          'Sit down with them and open the survey on a phone or tablet. It takes about 5 minutes; they can skip any question.', `/surveys/${s.id}`,
          { subject: `📋 Youth survey due: ${s.recipient_name}`, html: `<p>Please sit down with ${esc(s.recipient_name)} this week and complete their survey together: <a href="${SITE}/surveys/${s.id}">open it here</a>.</p>`, text: `Youth survey due for ${s.recipient_name}: ${SITE}/surveys/${s.id}` });
      }
    }
  }

  // ---- 2. Reminders and closing old links ----
  const { data: open } = await admin.from('survey_sends').select('id, survey_key, token, recipient_name, recipient_email, expires_at, sent_at, reminders, status, resident_id, residents(first_name, last_name, preferred_name)').in('status', ['Sent', 'Waiting']);
  for (const s of open ?? []) {
    if (new Date(s.expires_at) < new Date()) {
      await admin.from('survey_sends').update({ status: 'Expired' }).eq('id', s.id); out.expired++; continue;
    }
    if (s.status !== 'Sent' || !s.recipient_email || !s.sent_at || s.reminders >= 2) continue;
    if (days(s.sent_at, today) < 7 * (s.reminders + 1)) continue;
    if (emailReady()) {
      const r = await sendEmail({ to: s.recipient_email, ...surveyEmail({ ...s, about: s.residents ? resName(s.residents) : null }, true) });
      if (r.error) { out.errors.push(`${s.recipient_email}: ${r.error}`); continue; }
      await sleep(600);
    }
    await admin.from('survey_sends').update({ reminders: s.reminders + 1, reminded_at: new Date().toISOString() }).eq('id', s.id);
    out.reminded++;
  }

  // ---- 3. Monthly QA review reminders ----
  const day = Number(today.slice(8, 10));
  const last = addDaysISO(today.slice(0, 7) + '-01', -1).slice(0, 7) + '-01'; // first day of last month
  const reviewers = people.filter((p) => !groupOf(p) && p.role !== 'admin' && (levelOf(p) >= 3 || (levelOf(p) === 2 && p.home_id)) && levelOf(p) <= 7);
  // Monthly reviews started with October 2026 (first one due Nov 10) — no alerts for months before that.
  if (last < REVIEW_START) return out;
  const { data: done } = await admin.from('qa_monthly_reviews').select('reviewer_id').eq('month', last);
  const doneBy = new Set((done ?? []).map((d) => d.reviewer_id));
  const label = monthName(last);
  for (const p of reviewers) {
    if (doneBy.has(p.id)) continue;
    const scope = levelOf(p) === 2 ? 'your house' : levelOf(p) === 3 ? 'your houses' : 'Evergreen';
    if (await notifyOnce(p, `qareview:${last}:${p.id}`, `📋 Monthly QA review — ${label}`,
      `Review last month for ${scope}: survey results, incidents and improvement actions, then write what you will do. Due by the 10th.`, '/review',
      { subject: `📋 Monthly QA review for ${label} — due by the 10th`, html: `<p>Please complete the monthly quality review for ${esc(scope)}: survey results, incidents and improvement actions for ${esc(label)}.</p><p><a href="${SITE}/review">Open the monthly review</a></p>`, text: `Monthly QA review for ${label}: ${SITE}/review` })) out.reviewAlerts++;
    if (day >= 10 && await notifyOnce(p, `qareview-late:${last}:${p.id}`, `⏰ Monthly QA review overdue — ${label}`, 'It was due on the 10th. Please complete it today.', '/review',
      { subject: `⏰ Monthly QA review overdue — ${label}`, html: `<p>Your monthly quality review for ${esc(label)} was due on the 10th. <a href="${SITE}/review">Complete it now</a>.</p>`, text: `Overdue: ${SITE}/review` })) out.reviewAlerts++;
  }
  if (day >= 10) {
    const missing = reviewers.filter((p) => !doneBy.has(p.id));
    if (missing.length) for (const d of people.filter((x) => levelOf(x) >= 4 && levelOf(x) <= 8 && !groupOf(x))) {
      if (await notifyOnce(d, `qareview-missing:${last}:${d.id}`, `Monthly QA reviews missing — ${label}`, `${missing.length} not done: ${missing.map((m) => m.full_name).slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`, '/qa/surveys#reviews',
        { subject: `Monthly QA reviews missing — ${label}`, html: `<p>${missing.length} monthly QA review${missing.length === 1 ? ' is' : 's are'} not done for ${esc(label)}:</p><ul>${missing.map((m) => `<li>${esc(m.full_name)}</li>`).join('')}</ul><p><a href="${SITE}/qa/surveys#reviews">Open the QA portal</a></p>`, text: `Missing reviews: ${missing.map((m) => m.full_name).join(', ')}` })) out.reviewAlerts++;
    }
  }
  return out;
}
