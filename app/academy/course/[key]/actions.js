'use server';
// Grades any Evergreen Academy course quiz — inside the database (supabase/academy-integrity.sql).
// It needs a full, unused viewing of the lesson; every attempt uses it up. A pass adds the course to the training record.
import { revalidatePath } from 'next/cache';
import { gradeInDatabase } from '../../lessonActions';

export async function gradeCourse(key, answers) {
  const r = await gradeInDatabase(key, answers);
  revalidatePath('/academy'); revalidatePath(`/academy/course/${key}`);
  return r;
}
