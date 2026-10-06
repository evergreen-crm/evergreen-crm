'use server';
// Notice board posts on the house dashboards and the main dashboard.
// Level 2 (Program Coordinator) posts to their own house; level 3+ to any house or all houses.
// The database enforces the same rules (supabase/house-dashboards.sql).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf, groupOf } from '@/lib/levels';

const text = (f, k) => { const v = f.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null; };
const backTo = (f) => { const p = text(f, 'back'); return p && p.startsWith('/') ? p : '/dashboard'; };
const go = (f, msg, bad) => {
  const p = backTo(f);
  redirect(`${p}${p.includes('?') ? '&' : '?'}${bad ? 'post_error' : 'post_ok'}=${encodeURIComponent(msg)}#notices`);
};
const refresh = () => { revalidatePath('/dashboard'); revalidatePath('/homes/[id]', 'page'); revalidatePath('/portal'); };

export async function createPost(formData) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  if (lvl < 2 || groupOf(profile)) go(formData, 'Only Program Coordinators and above can post.', true);
  const title = text(formData, 'title');
  if (!title) go(formData, 'Add a title.', true);
  let homeId = text(formData, 'home_id');
  if (homeId === 'all') homeId = null;
  if (lvl < 3) {
    if (!profile.home_id) go(formData, 'You are not linked to a house.', true);
    homeId = profile.home_id; // coordinators post to their own house only
  }
  const priority = ['Important', 'Urgent'].includes(text(formData, 'priority')) ? text(formData, 'priority') : 'Normal';
  const { error } = await supabase.from('house_posts').insert({
    home_id: homeId, title, body: text(formData, 'body'), priority,
    pinned: formData.get('pinned') === 'on', expires_on: text(formData, 'expires_on'), created_by: user.id,
  });
  if (error) go(formData, /house_posts/.test(error.message) ? 'Run supabase/house-dashboards.sql in Supabase first.' : 'Could not post: ' + error.message, true);
  refresh();
  go(formData, priority === 'Normal' ? 'Posted.' : `Posted — staff have been notified (${priority}).`);
}

export async function markPostRead(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(formData, 'post_id');
  await supabase.from('house_post_reads').upsert({ post_id: id, profile_id: user.id }, { onConflict: 'post_id,profile_id', ignoreDuplicates: true });
  refresh();
  redirect(`${backTo(formData)}#notices`);
}

export async function removePost(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.from('house_posts').delete().eq('id', text(formData, 'post_id'));
  if (error) go(formData, 'Could not remove: ' + error.message, true);
  refresh();
  go(formData, 'Post removed.');
}

export async function togglePin(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.from('house_posts').update({ pinned: formData.get('pinned') === '1', updated_at: new Date().toISOString() }).eq('id', text(formData, 'post_id'));
  if (error) go(formData, 'Could not change: ' + error.message, true);
  refresh();
  redirect(`${backTo(formData)}#notices`);
}
