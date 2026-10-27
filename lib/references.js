// 📨 Automatic reference checks (supabase/reference-checks.sql).
// 3 supervisor references per applicant / new staff member. Each gets a private form by email straight away,
// reminders after 3, 7 and 12 days, and the link closes after 21 days (HR is told to phone).
import 'server-only';
import { sendEmail, emailReady } from '@/lib/email';
import { fmtDate, TZ } from '@/lib/options';
import { RATING_WORDS, okEmail } from '@/lib/referenceForm';
export { REF_RELATIONS, REF_FORM, RATING_WORDS, okEmail, cleanRefs, refErrors } from '@/lib/referenceForm';

export const REMINDER_DAYS = [3, 7, 12];
export const REF_LINK_DAYS = 21;
const SITE = (process.env.SITE_URL || 'https://evergreen-crm-azure.vercel.app').replace(/\/$/, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function referenceEmail(r, kind = 'first') {
  const link = `${SITE}/f/ref/${r.token}`;
  const until = fmtDate(String(r.expires_at).slice(0, 10));
  const pre = kind === 'last' ? 'Last reminder: ' : kind === 'reminder' ? 'Reminder: ' : '';
  const subject = `${pre}Reference for ${r.about_name} — Evergreen Community Care`;
  const html = `<div style="font-family:Arial,sans-serif;color:#1d2420;max-width:560px;line-height:1.5">
    <p>Hello ${esc(r.ref_name)},</p>
    <p>${kind === 'first' ? '' : 'We haven’t received your reference yet. '}<strong>${esc(r.about_name)}</strong> ${r.profile_id ? 'is joining' : 'has applied to work with'} Evergreen Community Care${r.position ? ` as <strong>${esc(r.position)}</strong>` : ''}, and named you as a supervisor reference. ${esc(r.about_name)} gave permission for us to contact you.</p>
    <p>Evergreen supports youth and adults in care in British Columbia, so references are an important part of keeping them safe. The form takes about 5 minutes. Your answers are confidential and are only seen by our HR team.</p>
    <p style="margin:22px 0"><a href="${link}" style="background:#0b5a34;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Give the reference</a></p>
    <p style="font-size:13px">Prefer to talk? Reply to this email or call our HR team and we’ll phone you.</p>
    <p style="font-size:12px;color:#6a736d">The link works until ${until}. If the button doesn’t work, copy this link: ${link}<br />If you don’t know ${esc(r.about_name)}, please ignore this email.</p>
    <p style="font-size:12px;color:#6a736d">Evergreen Community Care Inc.</p></div>`;
  const text = `Hello ${r.ref_name},\n\n${kind === 'first' ? '' : 'We haven’t received your reference yet. '}${r.about_name} ${r.profile_id ? 'is joining' : 'has applied to work with'} Evergreen Community Care${r.position ? ` as ${r.position}` : ''} and named you as a supervisor reference. The form takes about 5 minutes and your answers are confidential.\n\n${link}\n\nThe link works until ${until}. If you don’t know ${r.about_name}, please ignore this email.\n\nEvergreen Community Care Inc.`;
  return { subject, html, text };
}

async function sendOne(admin, r, kind) {
  if (!emailReady()) {
    await admin.from('reference_requests').update({ status: kind === 'first' ? 'Not sent' : r.status, send_error: 'Email is not set up (RESEND_API_KEY).' }).eq('id', r.id);
    return false;
  }
  const res = await sendEmail({ to: r.ref_email, ...referenceEmail(r, kind) });
  const now = new Date().toISOString();
  if (res.error) {
    await admin.from('reference_requests').update({ ...(kind === 'first' ? { status: 'Not sent' } : {}), send_error: res.error }).eq('id', r.id);
    return false;
  }
  await admin.from('reference_requests').update(kind === 'first'
    ? { status: 'Sent', sent_at: now, send_error: null }
    : { reminders: (r.reminders ?? 0) + 1, last_reminded_at: now, send_error: null }).eq('id', r.id);
  return true;
}

// HR people: administrators, the HR group and anyone with HR screening access.
async function hrPeople(admin) {
  const [{ data: a }, { data: b }] = await Promise.all([
    admin.from('profiles').select('id').eq('active', true).or('role.eq.admin,staff_group.eq.hr'),
    admin.from('prescreen_access').select('profile_id').eq('access', 'hr'),
  ]);
  return [...new Set([...(a ?? []).map((x) => x.id), ...(b ?? []).map((x) => x.profile_id)])];
}
export async function notifyHR(admin, title, body, link, key) {
  for (const pid of await hrPeople(admin)) await admin.rpc('notify', { pid, t: title, b: body, l: link, k: key ? `${key}:${pid}` : null });
}
export const requestLink = (r) => (r.prescreen_id ? `/hr/prescreen/${r.prescreen_id}?tab=references` : `/hr/${r.profile_id}/onboarding`);

// Create (or replace) the 3 requests and email them now. A reference whose details didn't change is left alone.
export async function createReferenceRequests(admin, { prescreenId = null, profileId = null, aboutName, position = null, refs, createdBy = null }) {
  const col = prescreenId ? 'prescreen_id' : 'profile_id';
  const owner = prescreenId ?? profileId;
  const { data: existing } = await admin.from('reference_requests').select('id, idx, ref_email, status').eq(col, owner).neq('status', 'Cancelled');
  const out = { sent: 0, failed: 0, kept: 0 };
  for (let i = 0; i < 3; i++) {
    const r = refs[i];
    if (!r?.email || !okEmail(r.email)) continue;
    const same = (existing ?? []).find((x) => x.idx === i && x.ref_email === r.email);
    if (same && same.status !== 'Not sent') { out.kept++; continue; }
    const old = (existing ?? []).filter((x) => x.idx === i && x.id !== same?.id && !['Completed'].includes(x.status));
    if (old.length) await admin.from('reference_requests').update({ status: 'Cancelled' }).in('id', old.map((x) => x.id));
    let row = same;
    if (!row) {
      const { data, error } = await admin.from('reference_requests').insert({
        prescreen_id: prescreenId, profile_id: profileId, idx: i, about_name: aboutName, position,
        ref_name: r.name, ref_title: r.title, ref_org: r.org, ref_relation: r.rel, ref_email: r.email, ref_phone: r.phone,
        status: 'Not sent', created_by: createdBy,
      }).select('*').single();
      if (error) { out.failed++; continue; }
      row = data;
    } else {
      ({ data: row } = await admin.from('reference_requests').select('*').eq('id', same.id).single());
    }
    if (await sendOne(admin, row, 'first')) out.sent++;
    else {
      out.failed++;
      if (emailReady()) await notifyHR(admin, `📨 Reference email not sent: ${row.ref_name}`,
        `The reference form for ${aboutName} could not be emailed to ${row.ref_email}. Check the address and send it again, or phone ${row.ref_name}${row.ref_phone ? ` at ${row.ref_phone}` : ''}.`,
        requestLink(row), `refbad:${row.id}`);
    }
  }
  return out;
}

// HR: send again (optionally to a corrected email), with a fresh 21-day link.
export async function resendReference(admin, id, newEmail = null) {
  const { data: r } = await admin.from('reference_requests').select('*').eq('id', id).maybeSingle();
  if (!r) return { error: 'Not found.' };
  if (r.status === 'Completed') return { error: 'This reference already answered.' };
  const email = newEmail ? newEmail.trim().toLowerCase() : r.ref_email;
  if (!okEmail(email)) return { error: 'That email address doesn’t look right.' };
  await admin.from('reference_requests').update({ status: 'Cancelled' }).eq('id', r.id);
  const { id: _i, token: _t, created_at: _c, sent_at: _s, opened_at: _o, last_reminded_at: _l, ...keep } = r;
  const { data: row, error } = await admin.from('reference_requests').insert({
    ...keep, ref_email: email, status: 'Not sent', reminders: 0, send_error: null,
    expires_at: new Date(Date.now() + REF_LINK_DAYS * 864e5).toISOString(),
  }).select('*').single();
  if (error) return { error: error.message };
  return (await sendOne(admin, row, 'first')) ? { ok: true } : { error: 'The email could not be sent. Check the address, or phone the reference.' };
}

// Nightly (lib/automation.js): reminders after 3, 7 and 12 days; close links after 21 days and tell HR.
export async function runReferenceJob(admin) {
  const out = { reminded: 0, expired: 0, errors: [] };
  const { data: open, error } = await admin.from('reference_requests').select('*').in('status', ['Sent', 'Opened']);
  if (error) { if (!/relation|schema/i.test(error.message)) out.errors.push(error.message); return out; }
  const now = Date.now();
  for (const r of open ?? []) {
    if (new Date(r.expires_at).getTime() < now) {
      await admin.from('reference_requests').update({ status: 'Expired' }).eq('id', r.id);
      await notifyHR(admin, `📞 No reply from reference: ${r.ref_name}`,
        `${r.ref_name} (${r.ref_org ?? ''}) didn’t answer the reference form for ${r.about_name} within ${REF_LINK_DAYS} days. Please phone them${r.ref_phone ? ` at ${r.ref_phone}` : ''}, or resend the form.`,
        requestLink(r), `refexp:${r.id}`);
      out.expired++;
      continue;
    }
    const age = (now - new Date(r.sent_at ?? r.created_at).getTime()) / 864e5;
    const due = REMINDER_DAYS[r.reminders ?? 0];
    if (due !== undefined && age >= due) {
      const ok = await sendOne(admin, r, (r.reminders ?? 0) === REMINDER_DAYS.length - 1 ? 'last' : 'reminder');
      if (ok) out.reminded++; else out.errors.push(`Reference reminder to ${r.ref_email} failed`);
    }
  }
  return out;
}

// After a reference answers: fill in the applicant's reference check and tell HR.
export async function onReferenceCompleted(admin, r) {
  if (r.prescreen_id) {
    const { data: p } = await admin.from('prescreens').select('ref_checks').eq('id', r.prescreen_id).maybeSingle();
    const checks = structuredClone(p?.ref_checks ?? [{}, {}, {}]);
    while (checks.length < 3) checks.push({});
    const a = r.answers ?? {};
    if (!checks[r.idx]?.done) {
      checks[r.idx] = {
        date: new Date(r.completed_at).toLocaleDateString('en-CA', { timeZone: TZ }), method: 'Email form', rehire: r.rehire ?? '', mgr: !!r.confirms_supervised,
        empv: !!(a.from && a.position), done: true, by: null, by_name: `Reference form — answered by ${r.signed_name ?? r.ref_name}`,
        answers: { 0: `${a.relationship ?? ''} · ${a.position ?? ''}`, 1: `${a.from ?? ''} – ${a.to || 'present'}`, 2: RATING_WORDS[a.r_reliability] ?? '',
          3: RATING_WORDS[a.r_clients] ?? '', 4: RATING_WORDS[a.r_stress] ?? '', 5: [a.strengths, a.growth].filter(Boolean).join(' / '),
          6: a.concern === 'yes' ? `YES — ${a.concern_detail ?? ''}` : 'No concerns' },
        request_id: r.id,
      };
      await admin.from('prescreens').update({ ref_checks: checks }).eq('id', r.prescreen_id);
    }
  }
  const flag = r.concern || r.rehire === 'No' || r.confirms_supervised === false;
  await notifyHR(admin, `${flag ? '⚠️ Reference with a concern' : '✓ Reference received'}: ${r.about_name}`,
    `${r.signed_name ?? r.ref_name} (${r.ref_org ?? ''}) answered the reference form.${r.concern ? ' They raised a concern about working with children, youth or vulnerable adults.' : ''}${r.rehire === 'No' ? ' Would not rehire.' : ''}${r.confirms_supervised === false ? ' Says they did not supervise this person.' : ''}`,
    requestLink(r), `refdone:${r.id}`);
}
