'use server';
// Saves a staff file record (performance evaluation, supervision, job description acknowledgement).
// Access is enforced by row-level security on staff_file_records (Program Managers and up, and admins).
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

export async function addStaffRecord(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const profileId = text(formData, 'profile_id');
  const kind = text(formData, 'kind');
  if (!['performance_evaluation', 'supervision', 'job_description_acknowledged'].includes(kind)) throw new Error('Unknown record type.');
  const summary = text(formData, 'summary');
  if (!summary) throw new Error('Write what was reviewed or discussed.');
  const recordOn = text(formData, 'record_on');
  if (!recordOn) throw new Error('Enter the date.');
  const rating = text(formData, 'rating');
  const { error } = await supabase.from('staff_file_records').insert({
    profile_id: profileId,
    kind,
    record_on: recordOn,
    summary,
    rating: kind === 'performance_evaluation' ? rating : null,
    next_due_on: text(formData, 'next_due_on'),
  });
  if (error) throw new Error('Could not save: ' + error.message);
  revalidatePath(`/hr/${profileId}/records`);
  revalidatePath(`/hr/${profileId}/file`);
}
