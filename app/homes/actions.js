'use server';
// Houses and resident profiles: saving.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

const HOME_FIELDS = ['name', 'address', 'phone', 'licence_number', 'house_type', 'notes'];

export async function createHome(formData) {
  const { supabase } = await requireUser(['admin']);
  const row = Object.fromEntries(HOME_FIELDS.map((k) => [k, text(formData, k)]));
  row.capacity = text(formData, 'capacity');
  const { data, error } = await supabase.from('homes').insert(row).select('id').single();
  if (error) throw new Error('Could not add house: ' + error.message);
  revalidatePath('/homes');
  redirect(`/homes/${data.id}`);
}

export async function updateHome(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const id = text(formData, 'id');
  const row = Object.fromEntries(HOME_FIELDS.map((k) => [k, text(formData, k)]));
  row.capacity = text(formData, 'capacity');
  const { error } = await supabase.from('homes').update(row).eq('id', id);
  if (error) throw new Error('Could not save house: ' + error.message);
  revalidatePath(`/homes/${id}`);
  revalidatePath('/homes');
  redirect(`/homes/${id}`);
}

const RESIDENT_FIELDS = [
  'home_id', 'first_name', 'last_name', 'preferred_name', 'date_of_birth', 'gender', 'care_type',
  'status', 'admission_date', 'discharge_date', 'funder', 'file_number',
  'case_worker_name', 'case_worker_phone', 'case_worker_email',
  'guardian_name', 'guardian_relationship', 'guardian_phone',
  'emergency_contact_name', 'emergency_contact_phone',
  'phn', 'doctor_name', 'doctor_phone', 'allergies', 'diagnoses', 'medications_summary',
  'dietary_needs', 'behaviour_support_notes', 'school_or_day_program',
  'care_plan_review_date', 'profile_notes',
];

function residentRow(formData) {
  const row = Object.fromEntries(RESIDENT_FIELDS.map((k) => [k, text(formData, k)]));
  if (!row.status) row.status = 'active';
  for (const flag of ['is_indigenous', 'has_bsp', 'on_medication']) row[flag] = formData.get(flag) === 'on';
  return row;
}

export async function createResident(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const row = residentRow(formData);
  const { data, error } = await supabase.from('residents').insert(row).select('id').single();
  if (error) throw new Error('Could not add resident: ' + error.message);
  revalidatePath(`/homes/${row.home_id}`);
  redirect(`/residents/${data.id}`);
}

export async function updateResident(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const id = text(formData, 'id');
  const row = residentRow(formData);
  const { error } = await supabase.from('residents').update(row).eq('id', id);
  if (error) throw new Error('Could not save resident: ' + error.message);
  revalidatePath(`/residents/${id}`);
  revalidatePath(`/homes/${row.home_id}`);
  redirect(`/residents/${id}`);
}
