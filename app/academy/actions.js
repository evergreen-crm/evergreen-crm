'use server';
// Evergreen Academy: staff add their training dates; managers verify them (certificate issued).
import { revalidatePath } from 'next/cache';
import { requireUser, requireHR } from '@/lib/auth';
import { renewMonthsFor, addMonthsISO } from '@/lib/onboarding';
import { todayISO } from '@/lib/options';

const clean = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const text = (formData, key) => clean(formData.get(key));

export async function addMyTraining(info) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const title = clean(info.title === 'Other' ? info.other_title : info.title);
  const completed = clean(info.completed_on);
  if (!title || !completed) return { error: 'Please choose the training and the date you completed it.' };
  if (completed > todayISO()) return { error: 'The completion date can’t be in the future.' };
  if (info.file_path && !info.file_path.startsWith(user.id + '/')) return { error: 'Wrong folder.' };
  const months = renewMonthsFor(title);
  const { error } = await supabase.from('trainings').insert({
    profile_id: user.id, title, completed_on: completed,
    hours: clean(info.hours) ? Number(info.hours) : null, provider: clean(info.provider),
    expires_on: clean(info.expires_on) ?? (months ? addMonthsISO(completed, months) : null),
    notes: clean(info.notes), file_path: clean(info.file_path), created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath('/academy'); revalidatePath(`/hr/${user.id}`);
  return { ok: true };
}

export async function verifyTraining(formData) {
  const { supabase, user } = await requireHR();
  const id = text(formData, 'id');
  const { data: t } = await supabase.from('trainings').select('*').eq('id', id).maybeSingle();
  if (!t) throw new Error('Training not found.');
  const months = renewMonthsFor(t.title);
  const expires = t.expires_on ?? (months ? addMonthsISO(t.completed_on, months) : null);
  const certNo = t.certificate_no ?? `ECC-${t.completed_on.slice(0, 4)}-${t.id.slice(0, 6).toUpperCase()}`;
  const { error } = await supabase.from('trainings')
    .update({ verified_by: user.id, certificate_no: certNo, expires_on: expires }).eq('id', id);
  if (error) throw new Error('Could not verify: ' + error.message);
  if (expires) {
    await supabase.from('certifications').insert({
      profile_id: t.profile_id, cert_type: t.title, issued_on: t.completed_on, expires_on: expires,
      notes: `Evergreen Academy certificate ${certNo}`, created_by: user.id,
    });
  }
  revalidatePath('/academy'); revalidatePath(`/hr/${t.profile_id}`);
}

export async function rejectTraining(formData) {
  const { supabase } = await requireHR();
  const { error } = await supabase.from('trainings').delete().eq('id', text(formData, 'id')).is('verified_by', null);
  if (error) throw new Error('Could not remove: ' + error.message);
  revalidatePath('/academy');
}
