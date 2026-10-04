'use server';
// HR portal: everything that saves data.
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

export async function saveStaffDetails(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const profileId = text(formData, 'profile_id');
  const { error } = await supabase.from('staff_details').upsert({
    profile_id: profileId,
    position: text(formData, 'position'),
    employment_type: text(formData, 'employment_type'),
    hire_date: text(formData, 'hire_date'),
    emergency_contact: text(formData, 'emergency_contact'),
    emergency_phone: text(formData, 'emergency_phone'),
    notes: text(formData, 'notes'),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('Could not save details: ' + error.message);
  revalidatePath(`/hr/${profileId}`);
  revalidatePath('/hr');
}

export async function addCertification(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
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
  const { supabase } = await requireUser(['admin', 'manager']);
  const profileId = text(formData, 'profile_id');
  const { error } = await supabase.from('certifications').delete().eq('id', text(formData, 'id'));
  if (error) throw new Error(error.message);
  revalidatePath(`/hr/${profileId}`);
  revalidatePath('/hr');
}

export async function addTraining(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const profileId = text(formData, 'profile_id');
  const { error } = await supabase.from('trainings').insert({
    profile_id: profileId,
    title: text(formData, 'title'),
    completed_on: text(formData, 'completed_on'),
    hours: text(formData, 'hours'),
    notes: text(formData, 'notes'),
  });
  if (error) throw new Error('Could not add training: ' + error.message);
  revalidatePath(`/hr/${profileId}`);
}

export async function deleteTraining(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const profileId = text(formData, 'profile_id');
  const { error } = await supabase.from('trainings').delete().eq('id', text(formData, 'id'));
  if (error) throw new Error(error.message);
  revalidatePath(`/hr/${profileId}`);
}
