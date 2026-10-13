'use server';
// Grades the New Staff Orientation final quiz — inside the database (supabase/academy-integrity.sql).
// It needs a full, unused viewing of the lesson; every attempt uses it up.
import { revalidatePath } from 'next/cache';
import { gradeInDatabase } from '../lessonActions';

export async function gradeOrientation(answers) {
  const r = await gradeInDatabase('orientation', answers);
  revalidatePath('/academy'); revalidatePath('/academy/orientation');
  return r;
}
