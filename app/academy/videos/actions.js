'use server';
// Course videos kept in OneDrive: save or remove the share link for one course (CSO, CEO, Administrator).
// The database rule (training_videos) also checks the level.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { COURSES } from '@/lib/courses/catalog';

const KEYS = new Set(['orientation', ...COURSES.map((c) => c.key)]);

export async function saveVideoLink(formData) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (levelOf(profile) < 6 && profile.role !== 'admin') redirect('/academy');
  const key = String(formData.get('course_key') ?? '');
  const url = String(formData.get('url') ?? '').trim();
  const back = (m, bad) => redirect(`/academy/videos?${bad ? 'error' : 'ok'}=${encodeURIComponent(m)}#links`);
  if (!KEYS.has(key)) back('Unknown course.', true);
  if (!url) {
    const { error } = await supabase.from('training_videos').delete().eq('course_key', key);
    if (error) back('Could not remove the link: ' + error.message, true);
    revalidatePath('/academy', 'layout');
    back('Link removed. Staff now see the uploaded video or the narrated slides.');
  }
  if (!/^https:\/\//i.test(url)) back('Paste the full OneDrive share link (it starts with https://).', true);
  const { error } = await supabase.from('training_videos')
    .upsert({ course_key: key, url, updated_by: user.id, updated_at: new Date().toISOString() });
  if (error) back('Could not save the link: ' + error.message, true);
  revalidatePath('/academy', 'layout');
  back('Link saved. Open the course to check the video plays.');
}
