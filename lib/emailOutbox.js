// Step 7 — portal alerts by email (Resend; RESEND_API_KEY and EMAIL_FROM are set in Vercel).
//  * Urgent alerts (🆘 emergency, injury, safety problem, clock in/out permission, help requests and answers)
//    are emailed within a minute or two: right after the action that created them, and whenever anyone
//    uses the portal.
//  * Everything else goes out once a day with the 7 am job, in ONE email per person, and only if it is
//    still unread in the portal. That email lists the alert titles only — details stay in the portal.
//  * Each alert is emailed at most once (notifications.emailed_at). Needs supabase/help-email-gaps.sql.
import 'server-only';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { sendEmail, emailReady } from '@/lib/email';

const SITE = (process.env.SITE_URL || 'https://evergreen-crm-azure.vercel.app').replace(/\/$/, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The daily job already emails these itself.
const SELF_EMAILED = /^(act-digest|weekly):/;
const linkOf = (n) => (n.link ? (n.link.startsWith('http') ? n.link : SITE + n.link) : SITE + '/notifications');

function wrap(title, inner, href, label) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#1d2b24">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:20px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #dde5e0">
<tr><td style="background:#0b5a34;color:#fff;padding:16px 22px;font-size:15px;letter-spacing:1px"><strong>EVERGREEN</strong> COMMUNITY CARE</td></tr>
<tr><td style="padding:22px"><h2 style="margin:0 0 14px;font-size:20px;color:#0b5a34">${esc(title)}</h2>${inner}
<p style="margin:22px 0 4px"><a href="${href}" style="background:#0b5a34;color:#fff;text-decoration:none;padding:11px 18px;border-radius:6px;display:inline-block;font-weight:bold">${esc(label)}</a></p></td></tr>
<tr><td style="padding:14px 22px;background:#f4f6f5;color:#6b7a72;font-size:12px">Automatic message from the Evergreen portal. Please don’t reply — open the portal instead.</td></tr>
</table></td></tr></table></body></html>`;
}

async function people(admin, ids) {
  let { data, error } = await admin.from('profiles').select('id, full_name, email, active, email_alerts').in('id', ids);
  if (error) ({ data } = await admin.from('profiles').select('id, full_name, email, active').in('id', ids));
  const list = data ?? [];
  if (list.some((p) => !p.email)) {
    const { data: au } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const byId = Object.fromEntries((au?.users ?? []).map((u) => [u.id, u.email]));
    for (const p of list) p.email = p.email || byId[p.id] || null;
  }
  return Object.fromEntries(list.map((p) => [p.id, p]));
}

// mode 'urgent': send urgent alerts now. mode 'digest': the once-a-day email (also sends any urgent ones left).
export async function flushOutbox(mode = 'urgent') {
  const out = { sent: 0, skipped: 0, errors: [] };
  if (!adminKey() || !emailReady()) return { ...out, off: true };
  const admin = createAdminClient();
  const since = new Date(Date.now() - (mode === 'digest' ? 3 * 864e5 : 6 * 3600e3)).toISOString();

  let q = admin.from('notifications').select('id, profile_id, title, body, link, dedupe_key, urgent, read_at, created_at')
    .is('emailed_at', null).gte('created_at', since).order('created_at').limit(mode === 'digest' ? 2000 : 40);
  if (mode === 'urgent') q = q.eq('urgent', true);
  const { data: queued, error } = await q;
  if (error) return { ...out, errors: [/emailed_at|urgent/.test(error.message) ? 'Run supabase/help-email-gaps.sql first.' : error.message] };
  const rows = (queued ?? []).filter((n) => !SELF_EMAILED.test(n.dedupe_key ?? ''));
  if (!rows.length) return out;

  // Claim them (so two servers never email the same alert twice).
  const { data: claimed } = await admin.from('notifications').update({ emailed_at: new Date().toISOString(), email_note: 'sending' })
    .in('id', rows.map((n) => n.id)).is('emailed_at', null).select('id');
  const mine = new Set((claimed ?? []).map((c) => c.id));
  const work = rows.filter((n) => mine.has(n.id));
  if (!work.length) return out;
  const who = await people(admin, [...new Set(work.map((n) => n.profile_id))]);
  const note = async (ids, text) => { if (ids.length) await admin.from('notifications').update({ email_note: text.slice(0, 300) }).in('id', ids); };

  // Urgent: one email each, with the details.
  for (const n of work.filter((x) => x.urgent)) {
    const p = who[n.profile_id];
    if (!p?.active || !p.email) { await note([n.id], 'skipped: no email address'); out.skipped++; continue; }
    const r = await sendEmail({
      to: p.email, subject: n.title,
      html: wrap(n.title, n.body ? `<p style="font-size:15px">${esc(n.body)}</p>` : '', linkOf(n), 'Open in the portal'),
      text: `${n.title}\n\n${n.body ?? ''}\n\nOpen: ${linkOf(n)}`,
    });
    if (r.error) { out.errors.push(`${p.full_name}: ${r.error}`); await note([n.id], 'error: ' + r.error); } else { out.sent++; await note([n.id], 'sent'); }
    await sleep(600); // stay under Resend's rate limit
  }

  // Not urgent: only in the daily email, and only if still unread.
  const rest = work.filter((x) => !x.urgent);
  if (mode !== 'digest') {
    // (shouldn't happen — the urgent query only returns urgent ones) put them back in the queue
    if (rest.length) await admin.from('notifications').update({ emailed_at: null, email_note: null }).in('id', rest.map((n) => n.id));
    return out;
  }
  const read = rest.filter((n) => n.read_at);
  await note(read.map((n) => n.id), 'skipped: already read in the portal');
  out.skipped += read.length;
  const byPerson = {};
  for (const n of rest.filter((x) => !x.read_at)) (byPerson[n.profile_id] ??= []).push(n);
  for (const [pid, list] of Object.entries(byPerson)) {
    const p = who[pid];
    const ids = list.map((n) => n.id);
    if (!p?.active || !p.email) { await note(ids, 'skipped: no email address'); out.skipped += ids.length; continue; }
    if (p.email_alerts === false) { await note(ids, 'skipped: email reminders turned off'); out.skipped += ids.length; continue; }
    const first = (p.full_name ?? '').split(/[ ,@]/)[0] || 'there';
    const items = list.slice(0, 20).map((n) => `<li style="margin:0 0 6px"><a href="${linkOf(n)}" style="color:#0f3059">${esc(n.title)}</a></li>`).join('');
    const subject = `Evergreen: ${list.length} new alert${list.length === 1 ? '' : 's'} waiting for you`;
    const r = await sendEmail({
      to: p.email, subject,
      html: wrap(`You have ${list.length} unread alert${list.length === 1 ? '' : 's'}`, `<p>Hi ${esc(first)},</p><ul style="padding-left:18px">${items}</ul>${list.length > 20 ? `<p style="color:#6b7a72">…and ${list.length - 20} more.</p>` : ''}`, `${SITE}/notifications`, 'Open my alerts'),
      text: `Hi ${first},\n\n${list.map((n) => '- ' + n.title).join('\n')}\n\nOpen: ${SITE}/notifications`,
    });
    if (r.error) { out.errors.push(`${p.full_name}: ${r.error}`); await note(ids, 'error: ' + r.error); } else { out.sent++; await note(ids, 'sent in the daily email'); }
    await sleep(600);
  }
  return out;
}

// Called from the page layout: at most once a minute per server, after the page is sent.
let lastRun = 0;
export function maybeFlushUrgent() {
  if (Date.now() - lastRun < 60e3) return null;
  lastRun = Date.now();
  return flushOutbox('urgent').catch(() => null);
}

// "Send me a test email" (Help page, administrators).
export async function sendTestEmail(to, name) {
  if (!emailReady()) return { error: 'RESEND_API_KEY is not set in Vercel.' };
  return sendEmail({
    to, subject: 'Evergreen portal: test email',
    html: wrap('Email is working ✓', `<p>Hi ${esc(name ?? '')}, this test came from the Evergreen portal. Urgent alerts (🆘 emergencies, injuries, safety problems, permission requests, help questions) will arrive like this.</p>`, SITE, 'Open the portal'),
    text: 'Email is working. This test came from the Evergreen portal.',
  });
}
