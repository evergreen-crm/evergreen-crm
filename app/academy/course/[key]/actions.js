'use server';
// Grades any Evergreen Academy course quiz on the server. Each attempt is saved;
// a pass adds the course to the person's training record (for HR to verify).
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { todayISO } from '@/lib/options';
import { courseByKey } from '@/lib/courses/catalog';
import { CONTENT } from '@/lib/courses/content';
import { ANSWERS } from '@/lib/courses/answers';

export async function gradeCourse(key, answers) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const course = courseByKey(key);
  const questions = CONTENT[key]?.QUESTIONS;
  const keyed = ANSWERS[key];
  if (!course || !questions || !keyed) return { error: 'Course not found.' };
  const given = answers && typeof answers === 'object' ? answers : {};
  if (questions.some((q) => !Number.isInteger(given[q.id]))) return { error: 'Please answer every question.' };

  const results = questions.map((q) => ({ id: q.id, chose: given[q.id], correct: keyed[q.id].a, ok: given[q.id] === keyed[q.id].a, why: keyed[q.id].why }));
  const score = results.filter((r) => r.ok).length;
  const total = questions.length;
  const percent = Math.round((score / total) * 100);
  const passed = percent >= (course.passPercent ?? 80);

  const { error } = await supabase.from('course_attempts').insert({
    profile_id: user.id, course_key: key, score, total, passed,
    answers: Object.fromEntries(questions.map((q) => [q.id, given[q.id]])),
  });
  if (error) return { error: 'Could not save your attempt: ' + error.message };

  let recorded = false;
  if (passed) {
    const today = todayISO();
    const { data: already } = await supabase.from('trainings').select('id')
      .eq('profile_id', user.id).eq('title', course.trainingTitle).eq('completed_on', today).limit(1);
    if (!already?.length) {
      const { error: tErr } = await supabase.from('trainings').insert({
        profile_id: user.id, title: course.trainingTitle, completed_on: today, hours: course.hours,
        provider: 'Evergreen Academy (online course)',
        notes: `Passed Evergreen Academy quiz ${score}/${total} (${percent}%)`, created_by: user.id,
      });
      recorded = !tErr;
    } else recorded = true;
  }
  revalidatePath('/academy'); revalidatePath(`/academy/course/${key}`);
  return { ok: true, score, total, percent, passed, recorded, results };
}
