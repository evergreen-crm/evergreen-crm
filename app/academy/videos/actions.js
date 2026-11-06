'use server';
// Course videos with versions (Admin only). Every new video becomes the next version; older versions stay and
// can be put back. The database functions (supabase/course-video-versions.sql) also check that it is the Admin.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { COURSES } from '@/lib/courses/catalog';

const KEYS = new Set(['orientation', ...COURSES.map((c) => c.key)]);
const back = (key, m, bad) => redirect(`/academy/videos?${bad ? 'error' : 'ok'}=${encodeURIComponent(m)}#c-${key}`);

async function admin() {
  const { supabase, profile } = await requireUser(['admin']);
  if (profile.role !== 'admin') redirect('/academy');
  return supabase;
}

// Called by the upload box after the file is in storage.
export async function registerUpload({ key, path, fileName, size, seconds, notes }) {
  const supabase = await admin();
  if (!KEYS.has(key)) return { error: 'Unknown course.' };
  const { data, error } = await supabase.rpc('course_video_add', {
    p_key: key, p_source: 'upload', p_path: path, p_url: null, p_file_name: String(fileName ?? '').slice(0, 200),
    p_size: Number(size) || null, p_seconds: Math.floor(Number(seconds) || 0), p_notes: String(notes ?? '').slice(0, 500) || null,
  });
  if (error) return { error: error.message };
  revalidatePath('/academy', 'layout');
  return { version: data };
}

export async function addLinkVersion(formData) {
  const supabase = await admin();
  const key = String(formData.get('course_key') ?? '');
  const url = String(formData.get('url') ?? '').trim();
  const minutes = Number(formData.get('minutes') ?? 0);
  const notes = String(formData.get('notes') ?? '').trim().slice(0, 500);
  if (!KEYS.has(key)) back(key, 'Unknown course.', true);
  if (!/^https:\/\//i.test(url)) back(key, 'Paste the full OneDrive share link (it starts with https://).', true);
  const { data, error } = await supabase.rpc('course_video_add', {
    p_key: key, p_source: 'link', p_path: null, p_url: url, p_file_name: null, p_size: null,
    p_seconds: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0, p_notes: notes || null,
  });
  if (error) back(key, 'Could not save: ' + error.message, true);
  revalidatePath('/academy', 'layout');
  back(key, `Saved as version ${data}. Staff now see this video. Open the course to check it plays.`);
}

export async function useVersion(formData) {
  const supabase = await admin();
  const key = String(formData.get('course_key') ?? '');
  const { data, error } = await supabase.rpc('course_video_use', { p_id: String(formData.get('id') ?? '') });
  if (error) back(key, 'Could not switch: ' + error.message, true);
  revalidatePath('/academy', 'layout');
  back(key, `Version ${data} is now the video staff see.`);
}
