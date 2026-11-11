'use server';
// HR portal: everything that saves data.
import { revalidatePath } from 'next/cache';
import { requireUser, requireHR } from '@/lib/auth';
import { renewMonthsFor, addMonthsISO } from '@/lib/onboarding';
import { emailOfferLink } from '@/lib/offerEmail';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

// Hours each week (1 to 60), or blank.
const hoursOf = (formData) => { const n = Number(text(formData, 'hours_per_week')); return n > 0 && n <= 60 ? n : null; };

export async function saveStaffDetails(formData) {
  const { supabase } = await requireHR();
  const profileId = text(formData, 'profile_id');
  const { error } = await supabase.from('staff_details').upsert({
    profile_id: profileId,
    position: text(formData, 'position'),
    employment_type: text(formData, 'employment_type'),
    hours_per_week: hoursOf(formData),
    hire_date: text(formData, 'hire_date'),
    emergency_contact: text(formData, 'emergency_contact'),
    emergency_phone: text(formData, 'emergency_phone'),
    notes: text(formData, 'notes'),
    program: ['MCFD', 'CLBC', 'Both'].includes(text(formData, 'program')) ? text(formData, 'program') : 'Both',
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('Could not save details: ' + error.message);
  // The program was chosen on purpose (record-gaps.sql); ignore if that setup hasn't run yet.
  await supabase.from('staff_details').update({ program_confirmed: true }).eq('profile_id', profileId);
  await supabase.rpc('scan_record_gaps', { p_trigger: 'now' });
  // Position + full-time / part-time + start date: the offer letter is written and sent automatically (auto-offer.sql).
  const { data: offer } = await supabase.rpc('auto_offer', { p_profile: profileId });
  if (offer?.status === 'sent') await emailOfferLink(offer.id);
  revalidatePath(`/hr/${profileId}`);
  revalidatePath('/hr');
  revalidatePath('/records');
}

export async function addCertification(formData) {
  const { supabase } = await requireHR();
  const profileId = text(formData, 'profile_id');
  const certType = text(formData, 'cert_type') === 'Other'
    ? text(formData, 'cert_other') || 'Other'
    : text(formData, 'cert_type');
  const { error } = await supabase.from('certifications').insert({
    profile_id: profileId,
    cert_type: certType,
    issued_on: text(formData, 'issued_on'),
    expires_on: text(formData, 'expires_on'),
    notes: text(formData, 'notes'),
  });
  if (error) throw new Error('Could not add certification: ' + error.message);
  revalidatePath(`/hr/${profileId}`);
  revalidatePath('/hr');
}

export async function deleteCertification(formData) {
  const { supabase } = await requireHR();
  const profileId = text(formData, 'profile_id');
  const { error } = await supabase.from('certifications').delete().eq('id', text(formData, 'id'));
  if (error) throw new Error(error.message);
  revalidatePath(`/hr/${profileId}`);
  revalidatePath('/hr');
}

export async function addTraining(formData) {
  const { supabase, user } = await requireHR();
  const profileId = text(formData, 'profile_id');
  const title = text(formData, 'title');
  const completed = text(formData, 'completed_on');
  const months = renewMonthsFor(title);
  const expires = text(formData, 'expires_on') ?? (months ? addMonthsISO(completed, months) : null);
  const { data: tr, error } = await supabase.from('trainings').insert({
    profile_id: profileId, title, completed_on: completed,
    hours: text(formData, 'hours'), notes: text(formData, 'notes'), provider: text(formData, 'provider'),
    expires_on: expires, verified_by: user.id, created_by: user.id,
  }).select('id').single();
  if (error) throw new Error('Could not add training: ' + error.message);
  await supabase.from('trainings').update({ certificate_no: `ECC-${completed.slice(0, 4)}-${tr.id.slice(0, 6).toUpperCase()}` }).eq('id', tr.id);
  revalidatePath(`/hr/${profileId}`);
}

export async function deleteTraining(formData) {
  const { supabase } = await requireHR();
  const profileId = text(formData, 'profile_id');
  const { error } = await supabase.from('trainings').delete().eq('id', text(formData, 'id'));
  if (error) throw new Error(error.message);
  revalidatePath(`/hr/${profileId}`);
}

// Employment status: active, on leave, resigned, terminated, retired.
export async function saveEmployment(formData) {
  const { supabase, profile } = await requireHR();
  const profileId = text(formData, 'profile_id');
  const status = text(formData, 'employment_status') ?? 'Active';
  const { error } = await supabase.from('staff_details').upsert({
    profile_id: profileId,
    employment_status: status,
    resignation_date: text(formData, 'resignation_date'),
    last_day: text(formData, 'last_day'),
    separation_reason: text(formData, 'separation_reason'),
    rehire_eligible: text(formData, 'rehire_eligible'),
    exit_interview_on: text(formData, 'exit_interview_on'),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('Could not save: ' + error.message);
  // Turn off their sign-in (admin only). They can be switched back on in Admin.
  if (formData.get('turn_off_access') === 'on') {
    if (profile.role !== 'admin') throw new Error('Only the admin can turn off access.');
    const { error: e2 } = await supabase.from('profiles').update({ active: false }).eq('id', profileId);
    if (e2) throw new Error('Saved, but could not turn off access: ' + e2.message);
  }
  if (formData.get('turn_on_access') === 'on' && profile.role === 'admin') {
    await supabase.from('profiles').update({ active: true }).eq('id', profileId);
  }
  revalidatePath(`/hr/${profileId}`);
  revalidatePath('/hr');
}
