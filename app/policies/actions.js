'use server';
// Policy library: add policies, publish new versions (version control), sign digitally.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};
const clean = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

// Called after the browser has uploaded the file to the private "policies" storage.
export async function createPolicy(info) {
  const { supabase, user } = await requireUser(['admin']);
  if (!clean(info.title) || !clean(info.file_path)) return { error: 'Title and file are required.' };
  const { data: pol, error } = await supabase.from('policies').insert({
    title: clean(info.title), code: clean(info.code), category: clean(info.category), description: clean(info.description),
    applies_to: ['MCFD', 'CLBC', 'Both'].includes(info.applies_to) ? info.applies_to : 'Both',
    require_signature: info.require_signature !== false, created_by: user.id,
  }).select('id').single();
  if (error) return { error: error.message };
  const res = await addVersion(supabase, user, pol.id, info);
  if (res.error) return res;
  revalidatePath('/policies');
  return { ok: true, id: pol.id };
}

export async function publishVersion(info) {
  const { supabase, user } = await requireUser(['admin']);
  const res = await addVersion(supabase, user, info.policy_id, info);
  if (res.error) return res;
  revalidatePath('/policies');
  revalidatePath(`/policies/${info.policy_id}`);
  return { ok: true };
}

async function addVersion(supabase, user, policyId, info) {
  const label = clean(info.version_label) ?? '1.0';
  const { data: v, error } = await supabase.from('policy_versions').insert({
    policy_id: policyId, version_label: label, file_path: info.file_path, file_name: clean(info.file_name),
    file_type: clean(info.file_type), change_note: clean(info.change_note),
    effective_date: clean(info.effective_date) ?? undefined, published_by: user.id,
  }).select('id').single();
  if (error) {
    await supabase.storage.from('policies').remove([info.file_path]);
    return { error: error.code === '23505' ? `Version ${label} already exists — use a new number.` : error.message };
  }
  // Making it current notifies every staff member to read and sign it.
  const { error: e2 } = await supabase.from('policies').update({ current_version_id: v.id }).eq('id', policyId);
  if (e2) return { error: e2.message };
  return { ok: true };
}

export async function updatePolicy(formData) {
  const { supabase } = await requireUser(['admin']);
  const id = text(formData, 'id');
  const { error } = await supabase.from('policies').update({
    title: text(formData, 'title'), code: text(formData, 'code'), category: text(formData, 'category'),
    description: text(formData, 'description'), applies_to: text(formData, 'applies_to') ?? 'Both', require_signature: formData.get('require_signature') === 'on',
    active: formData.get('active') === 'on',
  }).eq('id', id);
  if (error) throw new Error('Could not save: ' + error.message);
  revalidatePath('/policies'); revalidatePath(`/policies/${id}`);
}

// Makes an older version current again (roll back). Staff are asked to sign it again.
export async function restoreVersion(formData) {
  const { supabase } = await requireUser(['admin']);
  const id = text(formData, 'policy_id');
  const { error } = await supabase.from('policies').update({ current_version_id: text(formData, 'version_id') }).eq('id', id);
  if (error) throw new Error('Could not restore: ' + error.message);
  revalidatePath('/policies'); revalidatePath(`/policies/${id}`);
}

export async function signPolicy(formData) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const policyId = text(formData, 'policy_id');
  const back = (msg) => redirect(`/policies/${policyId}?error=${encodeURIComponent(msg)}#sign`);
  if (formData.get('agree') !== 'on') back('Please tick the box to confirm you have read it.');
  const norm = (v) => (v ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  const typed = (text(formData, 'signed_name') ?? '').replace(/\s+/g, ' ');
  if (!typed || norm(typed) !== norm(profile.full_name)) {
    back(`To sign, type your full name exactly as it is on your account: "${profile.full_name}". If your name is wrong, ask the admin to correct it.`);
  }
  const { error } = await supabase.from('policy_acks').insert({
    policy_id: policyId, policy_version_id: text(formData, 'version_id'), profile_id: user.id, signed_name: typed,
  });
  if (error) back(error.code === '23505' ? 'You already signed this version.' : 'Could not sign: ' + error.message);
  revalidatePath('/policies'); revalidatePath(`/policies/${policyId}`); revalidatePath('/onboarding');
  redirect(`/policies/${policyId}?signed=1#sign`);
}
