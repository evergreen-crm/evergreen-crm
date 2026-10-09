'use server';
// Probation: 30 / 90 / 120-day reviews, then confirmation to full-time.
// The database decides who may do what (supabase/launch-people.sql).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { todayISO } from '@/lib/options';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const back = (path, msg, bad) => redirect(`${path}${path.includes('?') ? '&' : '?'}${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);

export async function startProbation(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const staff = text(fd, 'staff_id'); const hire = text(fd, 'hire_date');
  if (!staff || !hire) back('/probation', 'Choose the staff member and their hire date.', true);
  const { error } = await supabase.from('staff_probation').insert({ staff_id: staff, hire_date: hire, position: text(fd, 'position') });
  if (error) back('/probation', error.code === '23505' ? 'That person is already on the probation list.' : error.message.includes('row-level') ? 'You can only add staff from your own house.' : error.message, true);
  // Keep the HR file's hire date in step.
  await supabase.from('staff_details').upsert({ profile_id: staff, hire_date: hire }, { onConflict: 'profile_id' });
  revalidatePath('/probation');
  back('/probation', 'Added — 30, 90 and 120-day reviews are booked.');
}

export async function saveReview(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(fd, 'id'); const path = `/probation/${id}`;
  const complete = fd.get('complete') === '1';
  const patch = {
    rating: text(fd, 'rating'), strengths: text(fd, 'strengths'), areas_to_improve: text(fd, 'areas_to_improve'),
    goals_next_period: text(fd, 'goals_next_period'), final_decision: text(fd, 'final_decision'),
  };
  if (complete) { patch.completed_on = text(fd, 'completed_on') ?? todayISO(); patch.reviewer_id = (await supabase.auth.getUser()).data.user?.id; }
  const { data, error } = await supabase.from('probation_reviews').update(patch).eq('id', id).select('id');
  if (error) back(path, error.message, true);
  if (!data?.length) back(path, 'Not saved — you can’t change this review.', true);
  revalidatePath('/probation'); revalidatePath(path);
  const msg = !complete ? 'Draft saved.'
    : patch.final_decision === 'Confirm full-time' ? 'Review complete — confirmed full-time. The HR file now shows Full-time.'
    : patch.final_decision === 'Extend probation' ? 'Review complete — probation extended. A new review is booked in 30 days.'
    : patch.final_decision === 'End employment' ? 'Review complete — probation ended.' : 'Review complete.';
  back(path, msg);
}

export async function acknowledgeReview(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(fd, 'id');
  const { error } = await supabase.rpc('acknowledge_probation_review', { review: id });
  if (error) back(`/probation/${id}`, error.message, true);
  revalidatePath(`/probation/${id}`);
  back(`/probation/${id}`, 'Thank you — you have acknowledged this review.');
}
