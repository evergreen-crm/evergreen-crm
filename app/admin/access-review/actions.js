'use server';
// Monthly access review sign-off (plan B4). Keeps a copy of the list with the sign-off.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { todayISO } from '@/lib/options';

export async function signOffReview(fd) {
  const { supabase, user, profile } = await requireUser(['admin']);
  if (profile.role !== 'admin') redirect('/');
  const today = todayISO();
  const month = today.slice(0, 7) + '-01';
  const { data: people } = await supabase.rpc('access_review_list');
  const { flagsFor } = await import('./flags');
  const snapshot = (people ?? []).map((p) => ({
    name: p.full_name, email: p.email, role: p.role, level: p.level, group: p.staff_group, active: p.active,
    home: p.home, extra_homes: p.extra_homes, departments: p.departments, prescreen: p.prescreen,
    last_sign_in: p.last_sign_in, flags: flagsFor(p, today),
  }));
  const notes = (fd.get('notes') ?? '').toString().trim().slice(0, 4000) || null;
  const { error } = await supabase.from('access_reviews').insert({
    review_month: month, reviewed_by: user.id, notes, snapshot,
    flagged: snapshot.filter((p) => p.active && p.flags.length).length,
  });
  if (error) redirect(`/admin/access-review?error=${encodeURIComponent(error.code === '23505' ? 'This month is already signed off.' : error.message)}`);
  revalidatePath('/admin/access-review');
  redirect(`/admin/access-review?ok=${encodeURIComponent('Review signed off. Thank you.')}`);
}
