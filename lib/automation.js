// KPI Phase 2: the daily automatic job.
// Runs every morning (Vercel Cron -> /api/cron/daily) and from the "Run daily job now" button.
//   1. Scans the records for problems and updates action items (same as "Check for new issues now").
//   2. Saves this month's KPI scorecard snapshot (the last run of each month = month-end figure).
//   3. Emails each owner a reminder when they have something overdue, due within 2 days, red, or new.
//   4. Mondays: emails a weekly summary to level 4+ (Director of Operations and above).
// Every run is recorded in automation_runs. Emails are never sent twice for the same day / week.
import 'server-only';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { sendEmail, emailReady } from '@/lib/email';
import { scanIssues } from '@/lib/actionScan';
import { computeKpis, scorecard, overallCompliance, STATUS } from '@/lib/kpis';
import { levelOf } from '@/lib/levels';
import { todayISO, fmtDate, addDaysISO, weekStart, TZ } from '@/lib/options';

export const SITE_URL = (process.env.SITE_URL || 'https://evergreen-crm-azure.vercel.app').replace(/\/$/, '');
const URGENT_DAYS = 2;
const DONE = ['Closed', 'Dismissed'];
const WAITING = ['Evidence submitted', 'Approved'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const firstName = (p) => (p?.full_name ?? '').split(/[ ,@]/)[0] || 'there';
const isMonday = () => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date()) === 'Mon';

// What the setup still needs (shown on /action-items; no secret values are ever shown).
export function automationSetup() {
  return {
    serviceKey: !!adminKey(),
    email: emailReady(),
    cronSecret: !!process.env.CRON_SECRET,
  };
}

// ---------------------------------------------------------------- email layout
function layout(title, inner, button) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#1d2b24">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:20px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #dde5e0">
<tr><td style="background:#0b5a34;color:#fff;padding:16px 22px;font-size:15px;letter-spacing:1px"><strong>EVERGREEN</strong> COMMUNITY CARE</td></tr>
<tr><td style="padding:22px">
<h2 style="margin:0 0 14px;font-size:20px;color:#0b5a34">${esc(title)}</h2>
${inner}
${button ? `<p style="margin:22px 0 4px"><a href="${button.href}" style="background:#0b5a34;color:#fff;text-decoration:none;padding:11px 18px;border-radius:6px;display:inline-block;font-weight:bold">${esc(button.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:14px 22px;background:#f4f6f5;color:#6b7a72;font-size:12px">Automatic message from the Evergreen portal. You can turn reminder emails off on the Action required page.</td></tr>
</table></td></tr></table></body></html>`;
}
const dotFor = (i, today) => (i.severity === 'red' || (i.due_date && i.due_date < today) ? '🔴' : '🟡');
function dueText(i, today) {
  if (!i.due_date) return 'no due date';
  if (i.due_date < today) { const n = daysBetween(i.due_date, today); return `overdue ${n} day${n === 1 ? '' : 's'}`; }
  if (i.due_date === today) return 'due today';
  return `due ${fmtDate(i.due_date)}`;
}
function itemRows(items, today, names) {
  return `<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">${items.map((i) => `
<tr style="border-top:1px solid #e6ece8"><td width="22" valign="top">${dotFor(i, today)}</td>
<td valign="top"><a href="${SITE_URL}/action-items/${i.id}" style="color:#0f3059">${esc(i.title)}</a>${names ? `<br><span style="color:#6b7a72;font-size:12px">Owner: ${esc(names[i.owner_id] ?? 'Unassigned')}</span>` : ''}</td>
<td valign="top" align="right" style="white-space:nowrap;color:${i.due_date && i.due_date < today ? '#b3261e' : '#6b7a72'}">${esc(dueText(i, today))}</td></tr>`).join('')}</table>`;
}

// ---------------------------------------------------------------- the job
export async function runDailyJob({ trigger = 'cron', actorId = null, forceWeekly = false } = {}) {
  const started = new Date();
  if (!adminKey()) return { error: 'The Supabase secret key is not set in Vercel, so the daily job cannot run.' };
  const admin = createAdminClient();
  const today = todayISO();
  const summary = { scan: null, snapshot: false, reminders: 0, weekly: 0, emailErrors: [], skipped: [] };

  // 1. Scan
  const scan = await scanIssues(admin, actorId);
  if (scan.error) {
    await logRun(admin, trigger, false, { error: scan.error });
    return { error: 'Action items are not set up: ' + scan.error };
  }
  summary.scan = { created: scan.created, reopened: scan.reopened, raised: scan.raised, closed: scan.closed };

  // 2. Monthly snapshot (one row per month, updated each day; the last run of the month is the month-end figure)
  const kpis = computeKpis(scan.data);
  const card = scorecard(kpis);
  const overall = overallCompliance(kpis);
  {
    const { error } = await admin.from('kpi_snapshots').upsert({
      month: today.slice(0, 7) + '-01', taken_on: today, overall,
      scorecard: card.map(({ label, target, actual, status }) => ({ label, target, actual, status })),
      kpis: kpis.map(({ key, area, label, value, num, status, target, detail }) => ({ key, area, label, value: String(value ?? ''), num: num ?? null, status, target, detail })),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'month' });
    if (error) summary.skipped.push('Snapshot: ' + error.message); else summary.snapshot = true;
  }

  // People and their email addresses
  let { data: people, error: pErr } = await admin.from('profiles').select('id, full_name, email, role, level, home_id, active, email_alerts');
  if (pErr) { // kpi-phase2.sql not run yet: carry on without the on/off setting
    ({ data: people } = await admin.from('profiles').select('id, full_name, email, role, level, home_id, active'));
    summary.skipped.push('Email on/off setting missing — run supabase/kpi-phase2.sql');
  }
  people = (people ?? []).filter((p) => p.active && p.role !== 'family');
  if (people.some((p) => !p.email)) {
    const { data: au } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const byId = Object.fromEntries((au?.users ?? []).map((u) => [u.id, u.email]));
    people = people.map((p) => ({ ...p, email: p.email || byId[p.id] || null }));
  }
  const names = Object.fromEntries(people.map((p) => [p.id, p.full_name]));
  const wantsEmail = (p) => p.email && p.email_alerts !== false;

  const { data: openItems } = await admin.from('action_items').select('*').not('status', 'in', '("Closed","Dismissed")').order('due_date', { ascending: true, nullsFirst: false });
  const open = openItems ?? [];
  const since = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
  const soon = addDaysISO(today, URGENT_DAYS);

  // Sends the in-app notification first; only emails if this is the first time for this key (no double sends).
  const notifyOnce = async (p, key, title, body, link, email) => {
    const { data: ins, error } = await admin.from('notifications')
      .upsert({ profile_id: p.id, title, body, link, dedupe_key: key }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
    if (error) { summary.skipped.push('Notification: ' + error.message); return false; }
    if (!ins?.length) return false; // already sent
    if (wantsEmail(p) && emailReady()) {
      const r = await sendEmail({ to: p.email, ...email });
      if (r.error) summary.emailErrors.push(`${p.full_name}: ${r.error}`);
      await sleep(600); // stay under the email service's rate limit
    }
    return true;
  };

  // 3. Owner reminders
  const byOwner = {};
  for (const i of open) if (i.owner_id) (byOwner[i.owner_id] ??= []).push(i);
  const kpiOwners = scan.data.kpiOwners ?? {};
  const kpiOwnerName = (k) => (kpiOwners[k.key] ? names[kpiOwners[k.key]] ?? null : null);
  for (const p of people) {
    const mine = (byOwner[p.id] ?? []).filter((i) => !WAITING.includes(i.status));
    const urgent = mine.filter((i) => (i.due_date && i.due_date <= soon) || i.severity === 'red' || i.created_at >= since);
    const myKpis = kpis.filter((k) => kpiOwners[k.key] === p.id && ['red', 'yellow'].includes(k.status));
    const myRedKpis = myKpis.filter((k) => k.status === 'red');
    if (!urgent.length && !myRedKpis.length) continue;
    const overdue = mine.filter((i) => i.due_date && i.due_date < today).length;
    const subject = mine.length
      ? `⚠️ Action required: ${mine.length} item${mine.length === 1 ? '' : 's'}${overdue ? ` (${overdue} overdue)` : ''}${myRedKpis.length ? ` · ${myRedKpis.length} red KPI${myRedKpis.length === 1 ? '' : 's'}` : ''}`
      : `⚠️ Action required: ${myRedKpis.length} KPI${myRedKpis.length === 1 ? '' : 's'} you own ${myRedKpis.length === 1 ? 'is' : 'are'} red`;
    const kpiBlock = myKpis.length ? `<h3 style="font-size:16px;margin:18px 0 6px">KPIs you own that need attention</h3><ul style="padding-left:18px;margin:0">${myKpis.map((k) => `<li>${STATUS[k.status].dot} ${esc(k.label)}: <strong>${esc(k.value)}</strong> <span style="color:#6b7a72">(target ${esc(k.target)}) — ${esc(k.detail ?? '')}</span></li>`).join('')}</ul>` : '';
    const inner = `<p>Hi ${esc(firstName(p))},</p>${mine.length ? `<p>These action items are assigned to you. Please fix the problem, then open the item and submit what was done as evidence so a manager can approve and close it.</p>${itemRows(mine.slice(0, 25), today)}${mine.length > 25 ? `<p style="color:#6b7a72">…and ${mine.length - 25} more.</p>` : ''}` : ''}${kpiBlock}`;
    const text = `Hi ${firstName(p)},\n\nAction items assigned to you:\n${mine.map((i) => `- ${i.title} (${dueText(i, today)})`).join('\n') || '- none'}${myKpis.length ? `\n\nKPIs you own that need attention:\n${myKpis.map((k) => `- ${k.label}: ${k.value} (target ${k.target})`).join('\n')}` : ''}\n\nOpen: ${SITE_URL}/action-items?view=mine`;
    const sent = await notifyOnce(p, `act-digest:${p.id}:${today}`, subject.replace('⚠️ ', ''), `${urgent.length} item${urgent.length === 1 ? '' : 's'} need attention now${myRedKpis.length ? ` · ${myRedKpis.length} of your KPIs red` : ''}.`, '/action-items?view=mine',
      { subject, html: layout('Action required', inner, { href: `${SITE_URL}/action-items?view=mine`, label: 'Open my action items' }), text });
    if (sent) summary.reminders++;
  }

  // 4. Weekly summary for level 4+ (Mondays; or when run by hand)
  if (isMonday() || forceWeekly) {
    const wk = weekStart(today);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: closedWeek } = await admin.from('action_items').select('id').in('status', DONE).gte('closed_at', weekAgo);
    const overdueItems = open.filter((i) => i.due_date && i.due_date < today);
    const waiting = open.filter((i) => i.status === 'Evidence submitted');
    const newWeek = open.filter((i) => i.created_at >= weekAgo);
    const reds = kpis.filter((k) => k.status === 'red');
    const yellows = kpis.filter((k) => k.status === 'yellow');
    const oc = overall === null ? null : overall >= 98 ? 'green' : overall >= 90 ? 'yellow' : 'red';
    const stat = (n, l, c) => `<td align="center" style="padding:10px;border:1px solid #e6ece8;border-radius:6px"><div style="font-size:22px;font-weight:bold;color:${c ?? '#1d2b24'}">${n}</div><div style="font-size:12px;color:#6b7a72">${l}</div></td>`;
    const inner = `
<p style="font-size:16px">${oc ? STATUS[oc].dot : '⚪'} <strong>Overall compliance ${overall === null ? '—' : overall + '%'}</strong></p>
<table width="100%" cellspacing="6" cellpadding="0"><tr>${stat(open.length, 'Open action items')}${stat(overdueItems.length, 'Overdue', overdueItems.length ? '#b3261e' : null)}${stat(waiting.length, 'Waiting for approval')}${stat(closedWeek?.length ?? 0, 'Closed this week', '#0b5a34')}${stat(newWeek.length, 'New this week')}</tr></table>
<h3 style="font-size:16px;margin:20px 0 6px">Monthly scorecard so far</h3>
<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<tr style="background:#f4f6f5"><th align="left">Category</th><th align="left">Target</th><th align="left">Actual</th><th></th></tr>
${card.map((r) => `<tr style="border-top:1px solid #e6ece8"><td>${esc(r.label)}</td><td>${r.label === 'Staffing' ? '95%' : r.target === 90 ? '90%+' : r.target + '%'}</td><td>${r.actual === null ? '<span style="color:#6b7a72">No data yet</span>' : r.actual + '%'}</td><td>${STATUS[r.status].dot}</td></tr>`).join('')}
</table>
${reds.length ? `<h3 style="font-size:16px;margin:20px 0 6px">🔴 Immediate action (${reds.length})</h3><ul style="padding-left:18px;margin:0">${reds.map((k) => `<li>${esc(k.label)}: <strong>${esc(k.value)}</strong> <span style="color:#6b7a72">— ${esc(k.detail ?? '')} · Owner: ${esc(kpiOwnerName(k) ?? 'not assigned')}</span></li>`).join('')}</ul>` : ''}
${yellows.length ? `<h3 style="font-size:16px;margin:16px 0 6px">🟡 Attention required (${yellows.length})</h3><ul style="padding-left:18px;margin:0">${yellows.map((k) => `<li>${esc(k.label)}: <strong>${esc(k.value)}</strong> <span style="color:#6b7a72">— ${esc(k.detail ?? '')} · Owner: ${esc(kpiOwnerName(k) ?? 'not assigned')}</span></li>`).join('')}</ul>` : ''}
${overdueItems.length ? `<h3 style="font-size:16px;margin:20px 0 6px">Overdue action items</h3>${itemRows(overdueItems.slice(0, 15), today, names)}${overdueItems.length > 15 ? `<p style="color:#6b7a72">…and ${overdueItems.length - 15} more.</p>` : ''}` : '<p>✅ No overdue action items.</p>'}`;
    const subject = `📊 Weekly KPI summary — overall compliance ${overall === null ? '—' : overall + '%'}`;
    const text = `Weekly KPI summary\nOverall compliance: ${overall ?? '—'}%\nOpen: ${open.length} · Overdue: ${overdueItems.length} · Waiting for approval: ${waiting.length} · Closed this week: ${closedWeek?.length ?? 0}\n\n${card.map((r) => `${r.label}: ${r.actual ?? '—'}%`).join('\n')}\n\nOpen: ${SITE_URL}/kpi`;
    for (const p of people.filter((x) => levelOf(x) >= 4)) {
      const sent = await notifyOnce(p, `weekly:${p.id}:${wk}`, `Weekly KPI summary — overall compliance ${overall ?? '—'}%`, `${overdueItems.length} overdue action items · ${reds.length} red KPIs`, '/kpi',
        { subject, html: layout(`Weekly summary — week of ${fmtDate(wk)}`, inner, { href: `${SITE_URL}/kpi`, label: 'Open the KPI page' }), text });
      if (sent) summary.weekly++;
    }
  }

  if (!emailReady()) summary.skipped.push('Email sending not set up (RESEND_API_KEY missing in Vercel) — in-app notifications only');
  const s = summary.scan;
  summary.text = `${s.created + s.reopened} new issues, ${s.raised} escalated, ${s.closed} closed automatically · ${summary.reminders} reminder${summary.reminders === 1 ? '' : 's'} sent · ${summary.weekly} weekly summar${summary.weekly === 1 ? 'y' : 'ies'} sent${summary.snapshot ? ' · scorecard snapshot saved' : ''}${summary.emailErrors.length ? ` · ${summary.emailErrors.length} email error(s)` : ''}.`;
  summary.seconds = Math.round((Date.now() - started) / 100) / 10;
  await logRun(admin, trigger, summary.emailErrors.length === 0, summary);
  return { summary };
}

async function logRun(admin, trigger, ok, summary) {
  await admin.from('automation_runs').insert({ job: 'daily', trigger, ok, summary });
}
