'use server';
// Staff bulk import (plan E3): upload -> check -> preview -> import. Administrator only.
// Each person is added the same way as "Give a person access" on the Admin page.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { roleForLevel } from '@/lib/levels';
import { readUpload, checkRows, MAX_ROWS } from '@/lib/staffImport';
import { POSITIONS } from '@/lib/prescreen';

const back = (q) => redirect('/admin/import?' + q);

export async function uploadImport(fd) {
  const { supabase, user } = await requireUser(['admin']);
  const file = fd.get('file');
  if (!file || typeof file === 'string' || !file.size) back('error=' + encodeURIComponent('Choose the filled-in template first.'));
  if (file.size > 900 * 1024) back('error=' + encodeURIComponent('The file is too big. Keep only the Staff sheet with up to 100 people.'));
  if (!/\.(xlsx|csv)$/i.test(file.name ?? '')) back('error=' + encodeURIComponent('Upload the Excel template (.xlsx) or a CSV file.'));
  let rows;
  try { rows = await readUpload(file); } catch (e) { back('error=' + encodeURIComponent('Could not read the file: ' + (e?.message ?? e))); }
  if (!rows.length) back('error=' + encodeURIComponent('No people found in the file. Fill in the rows under the header and delete the example row.'));
  if (rows.length > MAX_ROWS) back('error=' + encodeURIComponent(`The file has ${rows.length} people. Import up to ${MAX_ROWS} at a time.`));
  const [{ data: homes }, { data: pos }, { data: people }] = await Promise.all([
    supabase.from('homes').select('id, name'),
    supabase.rpc('pay_positions'),
    supabase.from('profiles').select('email'),
  ]);
  const positions = (pos ?? []).length ? pos.map((x) => (typeof x === 'string' ? x : x.position ?? x.pay_positions)).filter(Boolean) : POSITIONS;
  const checked = checkRows(rows, { homes: homes ?? [], positions, existingEmails: new Set((people ?? []).map((p) => (p.email ?? '').toLowerCase()).filter(Boolean)) });
  const { data: batch, error } = await supabase.from('staff_import_batches').insert({ file_name: String(file.name).slice(0, 200), rows: checked, created_by: user.id }).select('id').single();
  if (error) back('error=' + encodeURIComponent(error.message));
  redirect(`/admin/import?batch=${batch.id}`);
}

export async function cancelImport(fd) {
  const { supabase } = await requireUser(['admin']);
  await supabase.from('staff_import_batches').update({ status: 'Cancelled' }).eq('id', String(fd.get('batch'))).eq('status', 'Preview');
  back('ok=' + encodeURIComponent('Import cancelled. Nobody was added.'));
}

export async function runImport(fd) {
  const { supabase: mine, user: me } = await requireUser(['admin']);
  const id = String(fd.get('batch') ?? '');
  const sendOffers = fd.get('send_offers') === 'yes';
  const { data: batch } = await mine.from('staff_import_batches').select('*').eq('id', id).maybeSingle();
  if (!batch || batch.status !== 'Preview') back('error=' + encodeURIComponent('This import was already done or cancelled.'));
  // Lock the batch first so a double click can't import twice.
  const { data: locked } = await mine.from('staff_import_batches').update({ status: 'Imported', send_offers: sendOffers, imported_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'Preview').select('id');
  if (!locked?.length) back('error=' + encodeURIComponent('This import was already done.'));

  const admin = createAdminClient();
  const results = [];
  for (const r of batch.rows) {
    if (!r.ok) { results.push({ row: r.row, name: r.person.full_name, status: 'skipped', note: r.errors.join('; ') }); continue; }
    results.push(await addOne(admin, mine, me, r.person, sendOffers));
  }
  await mine.from('staff_import_batches').update({ results }).eq('id', id);
  revalidatePath('/admin'); revalidatePath('/hr'); revalidatePath('/admin/go-live');
  redirect(`/admin/import?batch=${id}`);
}

async function addOne(admin, mine, me, p, sendOffers) {
  const res = { name: p.full_name, email: p.email, status: 'added', note: '' };
  const role = roleForLevel(p.access.level);
  const { data: created, error: ce } = await admin.auth.admin.createUser({
    email: p.email, phone: p.phone ?? undefined, email_confirm: true, phone_confirm: !!p.phone, user_metadata: { full_name: p.full_name },
  });
  if (ce) return { ...res, status: 'failed', note: 'Could not add: ' + ce.message };
  const userId = created.user.id;
  const { error: pe } = await admin.from('profiles').insert({
    id: userId, full_name: p.full_name, email: p.email, phone: p.phone, role, level: p.access.level,
    home_id: !p.access.group && (role === 'staff' || role === 'manager') ? p.home_id : null,
    ...(p.access.group ? { staff_group: p.access.group } : {}), added_by: me.id,
  });
  if (pe) { await admin.auth.admin.deleteUser(userId); return { ...res, status: 'failed', note: 'Could not save the profile: ' + pe.message }; }
  res.profile_id = userId;

  const details = {
    profile_id: userId, updated_at: new Date().toISOString(),
    ...(p.position ? { position: p.position } : {}), ...(p.employment_type ? { employment_type: p.employment_type } : {}),
    ...(p.hire_date ? { hire_date: p.hire_date } : {}), ...(p.hours_per_week ? { hours_per_week: p.hours_per_week } : {}),
    ...(p.program ? { program: p.program, program_confirmed: true } : {}), ...(p.home_address ? { home_address: p.home_address } : {}),
    ...(p.emergency_contact ? { emergency_contact: p.emergency_contact } : {}), ...(p.emergency_phone ? { emergency_phone: p.emergency_phone } : {}),
  };
  const { error: de } = await admin.from('staff_details').upsert(details);
  const notes = [];
  if (de) notes.push('Job and contact details not saved (' + de.message + '): add them on their staff file.');

  if (p.certs?.length) {
    const { error: te } = await admin.from('trainings').insert(p.certs.map((c) => ({
      profile_id: userId, title: c.name, completed_on: c.issued || c.expires || new Date().toISOString().slice(0, 10), expires_on: c.expires,
      notes: 'From the staff import — check the original and verify.', created_by: me.id,
    })));
    notes.push(te ? 'Certificates not saved: ' + te.message : `${p.certs.length} certificate${p.certs.length === 1 ? '' : 's'} added (to verify)`);
  }

  const jobComplete = p.position && p.employment_type && p.hire_date;
  if (!de && jobComplete && sendOffers) {
    const { data: offer, error: oe } = await mine.rpc('auto_offer', { p_profile: userId });
    if (oe) notes.push('Offer letter not made: open their staff file → Job and press Save');
    else if (offer?.status === 'sent') {
      const { emailOfferLink } = await import('@/lib/offerEmail');
      const mailed = await emailOfferLink(offer.id).catch(() => false);
      notes.push(`Offer letter sent${mailed ? ' by email' : ' (in the portal)'}`);
    } else if (offer?.status === 'waiting_rate') notes.push(`Offer letter waits for a pay rate for “${p.position}”`);
  } else if (jobComplete) notes.push('No offer letter (you chose not to send them)');
  res.note = notes.join(' · ');
  return res;
}
