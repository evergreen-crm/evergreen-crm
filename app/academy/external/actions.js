'use server';
// Free government courses: a course only counts once the staff member uploads proof
// (certificate or completion screenshot) — or, for a reading, their written reflection — and a manager verifies it.
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { addMonthsISO } from '@/lib/onboarding';
import { todayISO } from '@/lib/options';
import { freeCourseByKey } from '@/lib/courses/freeCourses';

const clean = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export async function submitExternalCourse(key, info) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const c = freeCourseByKey(key);
  if (!c) return { error: 'Course not found.' };
  const completed = clean(info?.completed_on);
  if (!completed) return { error: 'Please enter the date you completed it.' };
  if (completed > todayISO()) return { error: 'The completion date can’t be in the future.' };
  if (!info?.attest) return { error: 'Please confirm you completed this course yourself.' };
  const filePath = clean(info?.file_path);
  if (filePath && !filePath.startsWith(user.id + '/')) return { error: 'Wrong folder.' };
  const reflection = clean(info?.reflection);
  if (c.proof === 'reading') {
    if (!reflection || reflection.length < 80) return { error: 'Please write the 3 things you learned (at least a few sentences).' };
  } else if (!filePath) {
    return { error: c.proof === 'screenshot' ? 'Please upload a screenshot of the completion page.' : 'Please upload your certificate — the course isn’t complete without it.' };
  }
  const { data: open } = await supabase.from('trainings').select('id').eq('profile_id', user.id).eq('title', c.trainingTitle).is('verified_by', null).limit(1);
  if (open?.length) return { error: 'You already sent this one — it’s waiting for your manager to verify.' };
  const { error } = await supabase.from('trainings').insert({
    profile_id: user.id, title: c.trainingTitle, completed_on: completed, hours: c.hours,
    provider: `${c.by} (free online course)`,
    expires_on: c.renewMonths ? addMonthsISO(completed, c.renewMonths) : null,
    notes: [`${c.proof === 'reading' ? 'Reading reflection' : c.proof === 'screenshot' ? 'Completion screenshot uploaded' : 'Certificate uploaded'} · signed by ${profile.full_name ?? 'staff'}`, clean(info?.notes), reflection && `What I learned: ${reflection}`].filter(Boolean).join(' · '),
    file_path: filePath, created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath('/academy'); revalidatePath(`/academy/external/${key}`); revalidatePath(`/hr/${user.id}`);
  return { ok: true };
}
