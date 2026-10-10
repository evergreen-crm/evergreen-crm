'use server';
// Grades the New Staff Orientation final quiz on the server.
// Every attempt is saved; a pass adds the course to the person's training record (for HR to verify).
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { todayISO } from '@/lib/options';
import { COURSE, QUESTIONS } from '@/lib/courses/orientation';
import { KEY } from '@/lib/courses/orientationKey';

export async function gradeOrientation(answers) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const given = answers && typeof answers === 'object' ? answers : {};
  if (QUESTIONS.some((q) => !Number.isInteger(given[q.id]))) return { error: 'Please answer every question.' };

  const results = QUESTIONS.map((q) => ({ id: q.id, chose: given[q.id], correct: KEY[q.id].a, ok: given[q.id] === KEY[q.id].a, why: KEY[q.id].why }));
  const score = results.filter((r) => r.ok).length;
  const total = QUESTIONS.length;
  const percent = Math.round((score / total) * 100);
  const passed = percent >= COURSE.passPercent;

  const { error } = await supabase.from('course_attempts').insert({
    profile_id: user.id, course_key: COURSE.key, score, total, passed,
    answers: Object.fromEntries(QUESTIONS.map((q) => [q.id, given[q.id]])),
  });
  if (error) {
    return { error: /course_attempts/.test(error.message) ? 'The course isn’t set up yet — run supabase/academy-courses.sql in Supabase.' : 'Could not save your attempt: ' + error.message };
  }

  let recorded = false;
  if (passed) {
    const today = todayISO();
    const { data: already } = await supabase.from('trainings').select('id')
      .eq('profile_id', user.id).eq('title', COURSE.trainingTitle).eq('completed_on', today).limit(1);
    if (!already?.length) {
      const { error: tErr } = await supabase.from('trainings').insert({
        profile_id: user.id, title: COURSE.trainingTitle, completed_on: today, hours: COURSE.hours,
        provider: 'Evergreen Academy (online course)',
        notes: `Passed final quiz ${score}/${total} (${percent}%)`, created_by: user.id,
      });
      recorded = !tErr;
    } else recorded = true;
  }
  revalidatePath('/academy'); revalidatePath('/academy/orientation');
  return { ok: true, score, total, percent, passed, recorded, results };
}
