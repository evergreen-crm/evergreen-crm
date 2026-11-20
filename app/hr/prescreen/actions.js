'use server';
// HR Prescreening: everything that saves data. Access is checked here AND by the database rules.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePrescreen } from '@/lib/prescreenAuth';
import { ALL_ITEMS, ITEM_KEYS, POSITIONS, POST, INTERVIEW, clearance } from '@/lib/prescreen';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { emailPrescreenLink } from '@/lib/prescreenLink';
import { sendEmail } from '@/lib/email';
import { fmtDate } from '@/lib/options';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const newToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
const back = (id, tab, m, ok) => redirect(`/hr/prescreen/${id}?tab=${tab}&${ok ? 'ok' : 'error'}=${encodeURIComponent(m)}`);

async function load(supabase, id) {
  const { data } = await supabase.from('prescreens')
    .select('id, link_status, program, drives, gives_meds, lived_outside, items, interview, ref_checks, post, file_status').eq('id', id).maybeSingle();
  return data;
}

export async function createPrescreen(fd) {
  const { supabase } = await requirePrescreen(['admin', 'hr']);
  const email = text(fd, 'email');
  if (!text(fd, 'first_name')) redirect('/hr/prescreen?error=' + encodeURIComponent('Enter the applicant’s first name.'));
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect('/hr/prescreen?error=' + encodeURIComponent('That email address doesn’t look right.'));
  const program = ['MCFD', 'CLBC', 'Both'].includes(text(fd, 'program')) ? text(fd, 'program') : 'Both';
  const { data, error } = await supabase.from('prescreens').insert({
    first_name: text(fd, 'first_name'), last_name: text(fd, 'last_name'), email: email?.toLowerCase() ?? null,
    phone: text(fd, 'phone'), position: POSITIONS.includes(text(fd, 'position')) ? text(fd, 'position') : null, program,
    token: newToken(), require_code: !!email && fd.get('require_code') === 'on',
  }).select('id').single();
  if (error) redirect('/hr/prescreen?error=' + encodeURIComponent(error.message));
  revalidatePath('/hr/prescreen');
  // Email the private link straight away (Melvin, Nov 20: HR only enters the details; the applicant does the rest).
  let note = 'Pre-screening file made.';
  if (email && adminKey()) {
    const r = await emailPrescreenLink(createAdminClient(), data.id);
    note = r.ok ? `Pre-screening file made and the private link was emailed to ${r.to}.` : `Pre-screening file made. The link could not be emailed (${r.error}); copy it below and send it yourself.`;
  }
  redirect(`/hr/prescreen/${data.id}?tab=link&ok=${encodeURIComponent(note)}`);
}

export async function emailLinkAgain(fd) {
  await requirePrescreen(['admin', 'hr']);
  const id = text(fd, 'id');
  if (!adminKey()) back(id, 'link', 'The server key is not set.');
  const r = await emailPrescreenLink(createAdminClient(), id);
  if (r.error) back(id, 'link', 'Could not email the link: ' + r.error);
  back(id, 'link', `Link emailed to ${r.to}.`, true);
}

// Review the signed pre-screen first: it passes or it doesn't. Nothing about an interview happens before this.
export async function decidePrescreen(fd) {
  const { supabase, profile } = await requirePrescreen();
  const id = text(fd, 'id');
  const decision = text(fd, 'decision');
  if (!['Passed', 'Not passed'].includes(decision)) back(id, 'application', 'Choose passes or doesn’t pass.');
  const { data: p, error } = await supabase.from('prescreens').update({ screen_decision: decision, screen_note: text(fd, 'note'), screen_decided_by: profile.id, screen_decided_at: new Date().toISOString() })
    .eq('id', id).eq('link_status', 'Submitted').select('id, first_name, email, application_no, decline_emailed_at, posting:posting_id(title)').single();
  if (error || !p) back(id, 'application', error?.message ?? 'The pre-screen has to be signed first.');
  let note = decision === 'Passed' ? 'Marked as passing the pre-screen. Now set the interview from their availability.' : 'Marked as not passing the pre-screen.';
  if (decision === 'Not passed' && fd.get('send_email') === 'on' && p.email && !p.decline_emailed_at) {
    const r = await sendEmail({ to: p.email, subject: `Your application to Evergreen Community Care — ${p.application_no}`,
      text: `Hello ${p.first_name},\n\nThank you for your interest in working with Evergreen Community Care${p.posting?.title ? ` (${p.posting.title})` : ''} and for completing your pre-screen (application ${p.application_no}). After careful review, we will not be moving forward with your application at this time.\n\nYou are welcome to apply for future openings on our Careers page.\n\nWe wish you all the best.\n\nEvergreen Community Care — HR` });
    if (!r.error) { await createAdminClient().from('prescreens').update({ decline_emailed_at: new Date().toISOString() }).eq('id', id); note += ' The email was sent.'; }
    else note += ` The email could not be sent (${r.error}).`;
  }
  revalidatePath('/hr/prescreen');
  back(id, decision === 'Passed' ? 'interview' : 'application', note, true);
}

// Set the interview (only after the pre-screen passes): date and time from the applicant's availability, how, where,
// and who interviews. The applicant is emailed; the interviewers get an alert and a reminder the day before.
export async function setInterview(fd) {
  const { supabase, profile } = await requirePrescreen();
  const id = text(fd, 'id');
  const when = text(fd, 'when');   // datetime-local, Pacific (UTC-7)
  if (!when || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) back(id, 'interview', 'Choose the interview date and time.');
  const at = new Date(when + ':00-07:00');
  if (at < new Date()) back(id, 'interview', 'The interview time is in the past.');
  const format = ['In person', 'Video call', 'Phone'].includes(text(fd, 'format')) ? text(fd, 'format') : 'In person';
  const where = text(fd, 'where');
  const withIds = fd.getAll('with').filter((x) => /^[0-9a-f-]{36}$/i.test(String(x)));
  if (!withIds.length) withIds.push(profile.id);
  const { data: p, error } = await supabase.from('prescreens').update({
    interview_at: at.toISOString(), interview_format: format, interview_where: where, interview_with: withIds, interview_note: text(fd, 'note'),
    interview_set_by: profile.id, interview_reminded_at: null,
  }).eq('id', id).eq('screen_decision', 'Passed').select('id, first_name, last_name, email, application_no, posting:posting_id(title)').single();
  if (error || !p) back(id, 'interview', error?.message ?? 'Mark the pre-screen as passing first.');
  const whenText = at.toLocaleString('en-CA', { timeZone: 'Etc/GMT+7', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const admin = adminKey() ? createAdminClient() : null;
  let note = `Interview set for ${whenText.replace(/\.$/, '')}.`;
  if (admin) {
    for (const w of withIds) {
      await admin.rpc('notify', { pid: w, t: `Interview: ${p.first_name} ${p.last_name ?? ''} (${p.application_no})`, b: `${whenText} · ${format}${where ? ` · ${where}` : ''}`, l: `/hr/prescreen/${id}?tab=interview`, k: `prescreen-int:${id}:${w}:${at.getTime()}` });
    }
    if (p.email) {
      const how = format === 'In person' ? `In person${where ? ` at ${where}` : ''}` : format === 'Video call' ? `Video call${where ? `: ${where}` : ' (we will send the link)'}` : `Phone${where ? ` — ${where}` : ' (we will call the number you gave)'}`;
      const r = await sendEmail({ to: p.email, subject: `Your interview with Evergreen Community Care — ${whenText}`,
        text: `Hello ${p.first_name},\n\nThank you for completing your pre-screen (application ${p.application_no}). We would like to invite you to an interview${p.posting?.title ? ` for ${p.posting.title}` : ''}.\n\nWhen: ${whenText} (Pacific time)\nHow: ${how}\n${text(fd, 'note') ? `\n${text(fd, 'note')}\n` : ''}\nPlease bring your government photo ID (we only note the type of ID) and the originals of your certificates.\n\nIf this time doesn't work, reply to this email or call us and we'll find another time.\n\nEvergreen Community Care — HR` });
      if (!r.error) { await admin.from('prescreens').update({ interview_emailed_at: new Date().toISOString() }).eq('id', id); note += ` ${p.first_name} was emailed the details.`; }
      else note += ` The email to the applicant could not be sent (${r.error}); please call them.`;
    }
  }
  revalidatePath('/hr/prescreen');
  back(id, 'interview', note, true);
}

// HR hires: the Administrator is asked to give access (the form fills in from this file).
export async function requestHire(fd) {
  const { supabase } = await requirePrescreen(['admin', 'hr']);
  const id = text(fd, 'id');
  const { error } = await supabase.rpc('prescreen_request_hire', { pid: id });
  if (error) back(id, 'application', error.message);
  revalidatePath('/hr/prescreen');
  back(id, 'application', 'The Administrator has been asked to give them access. Their offer letter, onboarding and orientation start as soon as they do.', true);
}

export async function renewLink(fd) {
  const { supabase } = await requirePrescreen(['admin', 'hr']);
  const id = text(fd, 'id');
  const { error } = await supabase.from('prescreens').update({
    token: newToken(), link_status: 'Sent', opened_at: null, verified_at: null, session_hash: null, otp_hash: null,
    otp_sent_at: null, otp_attempts: 0, expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  }).eq('id', id).neq('link_status', 'Submitted');
  if (error) back(id, 'link', error.message);
  const r = adminKey() ? await emailPrescreenLink(createAdminClient(), id) : { error: 'no server key' };
  back(id, 'link', r.ok ? `New link made and emailed to ${r.to}. The old link no longer works.` : 'New link made. The old link no longer works. Send the new one (it could not be emailed automatically).', true);
}

export async function cancelLink(fd) {
  const { supabase } = await requirePrescreen(['admin', 'hr']);
  const id = text(fd, 'id');
  const { error } = await supabase.from('prescreens').update({ link_status: 'Cancelled' }).eq('id', id).neq('link_status', 'Submitted');
  if (error) back(id, 'link', error.message);
  back(id, 'link', 'Link cancelled.', true);
}

// Applicant is here in person: open the form on this device without an email code.
export async function openInPerson(fd) {
  const { supabase } = await requirePrescreen(['admin', 'hr']);
  const id = text(fd, 'id');
  const { data, error } = await supabase.from('prescreens').update({ require_code: false, link_status: 'Sent' })
    .eq('id', id).in('link_status', ['Sent', 'Opened']).select('token').single();
  if (error || !data) back(id, 'link', error?.message ?? 'This link can’t be opened. Make a new link first.');
  redirect(`/f/prescreen/${data.token}`);
}

export async function saveProfile(fd) {
  const { supabase } = await requirePrescreen(['admin', 'hr']);
  const id = text(fd, 'id');
  const program = ['MCFD', 'CLBC', 'Both'].includes(text(fd, 'program')) ? text(fd, 'program') : 'Both';
  const { error } = await supabase.from('prescreens').update({
    program, worker_type: text(fd, 'worker_type'), drives: fd.get('drives') === 'on', gives_meds: fd.get('gives_meds') === 'on',
    lived_outside: fd.get('lived_outside') === 'on',
  }).eq('id', id);
  if (error) back(id, 'checklist', error.message);
  revalidatePath('/hr/prescreen');
  back(id, 'checklist', 'Screening profile saved. The checklist now shows the items for this program.', true);
}

export async function saveChecklist(fd) {
  const { supabase, profile, prescreenRole } = await requirePrescreen();
  const id = text(fd, 'id');
  const p = await load(supabase, id);
  if (!p) back(id, 'checklist', 'Prescreen not found.');
  const items = structuredClone(p.items ?? {});
  const now = new Date().toISOString();
  for (const it of ALL_ITEMS) {
    if (!fd.has(`st_${it.k}`)) continue;
    if (prescreenRole === 'interviewer' && ![2, 3].includes(it.sec)) continue;
    if (it.k === 'exec' && prescreenRole !== 'admin') continue;
    const st = text(fd, `st_${it.k}`) ?? 'todo';
    const cur = items[it.k] ?? {};
    const next = { ...cur, st, note: text(fd, `note_${it.k}`) ?? '', exp: it.exp ? (text(fd, `exp_${it.k}`) ?? '') : undefined };
    if (st !== (cur.st ?? 'todo')) { next.by = profile.id; next.by_name = profile.full_name; next.at = now; }
    items[it.k] = next;
  }
  for (const k of Object.keys(items)) if (!ITEM_KEYS.has(k)) delete items[k];
  const { error } = await supabase.from('prescreens').update({ items }).eq('id', id);
  if (error) back(id, 'checklist', error.message);
  revalidatePath('/hr/prescreen');
  back(id, 'checklist', 'Checklist saved.', true);
}

export async function saveInterview(fd) {
  const { supabase, profile } = await requirePrescreen();
  const id = text(fd, 'id');
  const p = await load(supabase, id);
  const scores = {}, notes = {};
  INTERVIEW.forEach((_, i) => {
    const k = `q${i + 1}`; const n = Number(fd.get(`score_${k}`));
    if (n >= 1 && n <= 5) scores[k] = n;
    notes[k] = text(fd, `note_${k}`) ?? '';
  });
  const interview = { ...(p?.interview ?? {}), date: text(fd, 'date'), format: text(fd, 'format'), scores, notes, overall: text(fd, 'overall') ?? '',
    by: p?.interview?.by ?? profile.id, by_name: p?.interview?.by_name ?? profile.full_name };
  const { error } = await supabase.from('prescreens').update({ interview }).eq('id', id);
  if (error) back(id, 'interview', error.message);
  revalidatePath('/hr/prescreen');
  back(id, 'interview', 'Interview saved.', true);
}

export async function saveReference(fd) {
  const { supabase, profile } = await requirePrescreen();
  const id = text(fd, 'id');
  const i = Number(fd.get('idx'));
  if (![0, 1, 2].includes(i)) back(id, 'references', 'Unknown reference.');
  const p = await load(supabase, id);
  const refs = structuredClone(p?.ref_checks ?? [{}, {}, {}]);
  while (refs.length < 3) refs.push({});
  const was = refs[i] ?? {};
  const answers = {};
  for (let j = 0; j < 7; j++) answers[j] = text(fd, `a_${j}`) ?? '';
  const isDone = fd.get('done') === 'on';
  refs[i] = { date: text(fd, 'date'), method: text(fd, 'method'), rehire: text(fd, 'rehire'), mgr: fd.get('mgr') === 'on',
    empv: fd.get('empv') === 'on', answers, done: isDone,
    by: isDone ? (was.done ? was.by : profile.id) : null, by_name: isDone ? (was.done ? was.by_name : profile.full_name) : null };
  const { error } = await supabase.from('prescreens').update({ ref_checks: refs }).eq('id', id);
  if (error) back(id, 'references', error.message);
  revalidatePath('/hr/prescreen');
  back(id, 'references', `Reference ${i + 1} saved.`, true);
}

export async function signOffPost(fd) {
  const { supabase, profile } = await requirePrescreen(['admin', 'hr']);
  const id = text(fd, 'id'); const key = text(fd, 'key'); const undo = fd.get('undo') === '1';
  if (!POST.includes(key)) back(id, 'clearance', 'Unknown step.');
  const { data: p } = await supabase.from('prescreens').select('*').eq('id', id).maybeSingle();
  if (!undo && clearance(p) !== 'green') back(id, 'clearance', 'This person must be GREEN – CLEARED before this sign-off.');
  const post = { ...(p.post ?? {}) };
  if (undo) delete post[key]; else post[key] = { by: profile.id, by_name: profile.full_name, at: new Date().toISOString() };
  const { error } = await supabase.from('prescreens').update({ post }).eq('id', id);
  if (error) back(id, 'clearance', error.message);
  revalidatePath('/hr/prescreen');
  back(id, 'clearance', undo ? 'Sign-off removed.' : 'Signed off.', true);
}

export async function saveFileStatus(fd) {
  const { supabase } = await requirePrescreen(['admin', 'hr']);
  const id = text(fd, 'id');
  const status = ['Open', 'On hold', 'Not moving forward'].includes(text(fd, 'file_status')) ? text(fd, 'file_status') : 'Open';
  const { error } = await supabase.from('prescreens').update({
    file_status: status, file_notes: text(fd, 'file_notes'), restrictions: text(fd, 'restrictions'),
  }).eq('id', id);
  if (error) back(id, 'clearance', error.message);
  revalidatePath('/hr/prescreen');
  back(id, 'clearance', 'Saved.', true);
}

export async function deletePrescreen(fd) {
  const { supabase } = await requirePrescreen(['admin', 'hr']);
  const id = text(fd, 'id');
  if (fd.get('confirm') !== 'on') back(id, 'clearance', 'Tick the box to confirm you want to delete this screening file.');
  const { error } = await supabase.from('prescreens').delete().eq('id', id);
  if (error) back(id, 'clearance', error.message);
  revalidatePath('/hr/prescreen');
  redirect('/hr/prescreen?ok=' + encodeURIComponent('Screening file deleted.'));
}

// ---------- Access (administrator only) ----------
export async function grantAccess(fd) {
  const { supabase } = await requirePrescreen(['admin']);
  const pid = text(fd, 'profile_id'); const access = text(fd, 'access');
  if (!pid || !['hr', 'interviewer'].includes(access)) redirect('/hr/prescreen/access?error=' + encodeURIComponent('Choose a person and a role.'));
  const { error } = await supabase.from('prescreen_access').upsert({ profile_id: pid, access });
  if (error) redirect('/hr/prescreen/access?error=' + encodeURIComponent(error.message));
  revalidatePath('/hr/prescreen/access');
  redirect('/hr/prescreen/access?ok=' + encodeURIComponent('Access granted.'));
}

export async function revokeAccess(fd) {
  const { supabase } = await requirePrescreen(['admin']);
  const { error } = await supabase.from('prescreen_access').delete().eq('profile_id', text(fd, 'profile_id'));
  if (error) redirect('/hr/prescreen/access?error=' + encodeURIComponent(error.message));
  revalidatePath('/hr/prescreen/access');
  redirect('/hr/prescreen/access?ok=' + encodeURIComponent('Access removed.'));
}
