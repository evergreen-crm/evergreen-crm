'use server';
// Save my monthly QA review (supabase/qa-phase2.sql checks who may review which house).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const t = (f, k) => { const v = f.get(k); return typeof v === 'string' && v.trim() ? v.trim().slice(0, 4000) : null; };

export async function saveReview(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const month = t(formData, 'month');
  if (!/^\d{4}-\d{2}-01$/.test(month ?? '')) redirect('/review?error=' + encodeURIComponent('Pick the month.'));
  const home = t(formData, 'home_id');
  if (!t(formData, 'went_well') && !t(formData, 'concerns') && !t(formData, 'actions')) redirect('/review?error=' + encodeURIComponent('Write at least a few words about the month.'));
  const { error } = await supabase.from('qa_monthly_reviews').insert({
    month, home_id: home, reviewer_id: user.id, went_well: t(formData, 'went_well'), concerns: t(formData, 'concerns'), actions: t(formData, 'actions'),
  });
  if (error) redirect('/review?error=' + encodeURIComponent(/duplicate/i.test(error.message) ? 'You already saved a review for that month.' : /row-level|policy/i.test(error.message) ? 'You can’t review that house.' : error.message));
  revalidatePath('/review'); revalidatePath('/qa/surveys');
  redirect('/review?ok=1');
}
