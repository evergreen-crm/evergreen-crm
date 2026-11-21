'use server';
// Social worker access (Nov 21, 2026): the house's PC or a manager adds, renews or ends a social worker's
// read-only view of one youth, and both sides send messages. The database decides who may (worker_access rules).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { fail } from '@/lib/fail';
import { addDaysISO, todayISO } from '@/lib/options';

const t = (fd, k, max = 300) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null; };
const ROLES = ['Social worker', 'Guardianship worker', 'Resource worker', 'Youth worker (MCFD)', 'CLBC facilitator', 'CLBC analyst', 'Other'];
const ORGS = ['MCFD', 'CLBC', 'Delegated Aboriginal Agency', 'Other'];
const back = (rid, msg) => redirect(`/residents/${rid}?tab=worker&ok=${encodeURIComponent(msg)}`);

async function lead(rid) {
  const r = await requireUser(['admin', 'manager', 'staff']);
  const { data: ok } = await r.supabase.rpc('can_manage_workers', { rid });
  if (!ok) await fail('Only the house’s Program Coordinator, a manager or the Administrator can manage social worker access.');
  return r;
}

export async function addWorker(fd) {
  const rid = t(fd, 'resident_id');
  const { supabase, user, profile } = await lead(rid);
  const name = t(fd, 'full_name', 120);
  const email = t(fd, 'email', 200)?.toLowerCase();
  const phone = t(fd, 'phone', 40);
  const role = ROLES.includes(t(fd, 'worker_role')) ? t(fd, 'worker_role') : 'Social worker';
  const org = ORGS.includes(t(fd, 'org')) ? t(fd, 'org') : 'MCFD';
  const until = t(fd, 'expires_on');
  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) await fail('Enter the social worker’s name and work email.');
  if (!until || until < todayISO() || until > addDaysISO(todayISO(), 366)) await fail('Choose an end date within the next 12 months.');
  if (fd.get('confirm') !== 'on') await fail('Tick the box to confirm this person is the youth’s current worker.');
  if (!adminKey()) await fail('The portal’s server key is not set up, so accounts can’t be made here.');
  const admin = createAdminClient();

  // Find or make their sign-in account. A staff email can't become a social worker account.
  let { data: existing } = await admin.from('profiles').select('id, role, full_name, active').eq('email', email).maybeSingle();
  if (existing && existing.role !== 'family') await fail('That email belongs to a staff account. Use the social worker’s own work email.');
  let workerId = existing?.id;
  if (!workerId) {
    const { data: created, error: ce } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
    if (ce) await fail('Could not make the account: ' + ce.message);
    workerId = created.user.id;
    const { error: pe } = await admin.from('profiles').insert({ id: workerId, full_name: name, email, phone, role: 'family', added_by: user.id });
    if (pe) { await admin.auth.admin.deleteUser(workerId); await fail('Could not save the account: ' + pe.message); }
  } else if (existing.active === false) {
    await admin.from('profiles').update({ active: true }).eq('id', workerId);
  }

  const { error } = await supabase.from('worker_access').insert({
    resident_id: rid, profile_id: workerId, worker_role: role, org, expires_on: until, granted_by: user.id,
  });
  if (error) await fail(error.code === '23505' ? 'This person already has access to this youth.' : 'Could not give access: ' + error.message);

  const { data: y } = await supabase.from('residents').select('first_name, preferred_name, last_name').eq('id', rid).maybeSingle();
  const youth = `${y?.preferred_name || y?.first_name || ''} ${(y?.last_name ?? '').slice(0, 1)}.`.trim();
  const site = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://evergreen-crm-azure.vercel.app').replace(/\/$/, '');
  const sent = await sendEmail({
    to: email,
    subject: 'Evergreen Community Care: your read-only access',
    text: `Hello ${name},\n\n${profile.full_name} at Evergreen Community Care has given you read-only access to ${youth}'s file, as their ${role.toLowerCase()} (${org}), until ${until}.\n\nSign in at ${site}/login with this email address. We send you a one-time code each time; there is no password.\n\nYou will see the care plan and goals, appointments, a weekly summary of daily notes, incidents after the Program Manager's review, documents to sign, and a message thread with the house team. Every view is recorded.\n\nFor anything urgent, please phone the house.\n\nEvergreen Community Care`,
  });
  revalidatePath(`/residents/${rid}`);
  back(rid, `Access given to ${name} until ${until}.${sent?.error ? ' The welcome email could not be sent (' + sent.error + '); tell them to sign in with this email.' : ' A welcome email was sent.'}`);
}

export async function renewWorker(fd) {
  const rid = t(fd, 'resident_id'); const id = t(fd, 'id');
  const { supabase, user } = await lead(rid);
  const until = addDaysISO(todayISO(), 183);
  const { error } = await supabase.from('worker_access').update({ expires_on: until, renewed_by: user.id, renewed_at: new Date().toISOString(), reminded_at: null }).eq('id', id).is('ended_at', null);
  if (error) await fail('Could not renew: ' + error.message);
  revalidatePath(`/residents/${rid}`);
  back(rid, `Renewed until ${until}.`);
}

export async function endWorker(fd) {
  const rid = t(fd, 'resident_id'); const id = t(fd, 'id');
  const { supabase, user } = await lead(rid);
  if (fd.get('confirm') !== 'on') await fail('Tick the box to confirm you are ending this access.');
  const { error } = await supabase.from('worker_access').update({ ended_at: new Date().toISOString(), ended_by: user.id, end_reason: t(fd, 'reason', 300) ?? 'Ended by staff' }).eq('id', id).is('ended_at', null);
  if (error) await fail('Could not end access: ' + error.message);
  revalidatePath(`/residents/${rid}`);
  back(rid, 'Access ended. They can no longer open this youth’s file.');
}

// Either side: a message in the social worker's thread for this youth.
export async function sendWorkerMessage(fd) {
  const rid = t(fd, 'resident_id'); const workerId = t(fd, 'worker_id'); const body = t(fd, 'body', 4000);
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff', 'family']);
  if (!body) await fail('Write a message first.');
  const { error } = await supabase.from('worker_messages').insert({ resident_id: rid, worker_id: workerId ?? user.id, sender_id: user.id, body });
  if (error) await fail('Could not send: ' + (/row-level security/i.test(error.message) ? 'you don’t have access to this thread.' : error.message));
  const mine = (workerId ?? user.id) === user.id;
  revalidatePath(mine ? `/worker/${rid}` : `/residents/${rid}`);
  redirect(mine ? `/worker/${rid}?tab=messages&ok=${encodeURIComponent('Sent to the house team.')}#end` : `/residents/${rid}?tab=worker&ok=${encodeURIComponent('Sent.')}#w-${workerId}`);
}
