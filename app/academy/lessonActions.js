'use server';
// Viewing sessions for Evergreen Academy lessons. The database times each viewing (supabase/academy-integrity.sql),
// so the quiz only opens after the whole lesson has actually played.
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';

const SETUP = 'Lesson tracking isn’t set up yet — run supabase/academy-integrity.sql in Supabase.';

export async function startLesson(key) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('lesson_start', { p_key: key });
  if (error) return { error: /lesson_start/.test(error.message) ? SETUP : error.message };
  return { id: data };
}

// Returns { left: seconds still to watch } — 0 means the quiz is unlocked.
export async function finishLesson(id) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('lesson_finish', { p_session: id });
  if (error) return { error: /lesson_finish/.test(error.message) ? SETUP : error.message };
  return { left: Number(data) };
}

// Level 6-8 only: the required viewing time follows the uploaded video's length.
export async function setLessonLength(key, seconds) {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (levelOf(profile) < 6) return { error: 'Only level 6-8 can change training videos.' };
  const { error } = await supabase.rpc('set_lesson_length', { p_key: key, p_seconds: Math.max(0, Math.floor(seconds)) });
  return error ? { error: error.message } : { ok: true };
}

// Grade any course quiz inside the database (answer keys are never sent to the app or the browser).
export async function gradeInDatabase(key, answers) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('grade_course', { p_key: key, p_answers: answers && typeof answers === 'object' ? answers : {} });
  if (error) return { error: /grade_course/.test(error.message) ? SETUP : 'Could not grade your quiz: ' + error.message };
  return data;
}
