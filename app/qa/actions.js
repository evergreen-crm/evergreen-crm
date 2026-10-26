'use server';
// Start an improvement action (corrective action plan) from the QA portal.
// It is a normal "Problems to fix" item (category Quality assurance), so the owner gets it on their
// to-do list and it goes through Open → In progress → Evidence → Approved → Closed.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canSeeQa, COA_AREAS } from '@/lib/qa';

const text = (f, k, n = 2000) => { const v = f.get(k); return typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null; };

export async function createQaAction(formData) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager']);
  if (!canSeeQa(profile)) redirect('/');
  const std = COA_AREAS.find((a) => a.code === text(formData, 'std'))?.code ?? 'PQI';
  let title = text(formData, 'title', 200);
  if (!title) redirect('/qa/actions?new=1&error=' + encodeURIComponent('Describe what needs to improve.'));
  if (!title.startsWith(`${std}:`)) title = `${std}: ${title}`;
  const due = text(formData, 'due_date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due ?? '')) redirect('/qa/actions?new=1&error=' + encodeURIComponent('Choose a due date.'));
  const cause = text(formData, 'cause'), fix = text(formData, 'fix'), check = text(formData, 'check');
  const details = [cause && `Why it happened: ${cause}`, fix && `What we will do: ${fix}`, check && `How we will know it worked: ${check}`].filter(Boolean).join('\n\n') || null;
  const { data: row, error } = await supabase.from('action_items').insert({
    title, details, category: 'qa', severity: text(formData, 'severity') === 'red' ? 'red' : 'yellow',
    home_id: text(formData, 'home_id', 40), owner_id: text(formData, 'owner_id', 40) ?? user.id, due_date: due,
    link: '/qa', created_by: user.id,
  }).select('id').single();
  if (error) redirect('/qa/actions?new=1&error=' + encodeURIComponent('Could not save: ' + error.message));
  await supabase.from('action_item_events').insert({ item_id: row.id, actor_id: user.id, action: 'Created', note: `Improvement action (COA ${std}) from the QA portal` });
  revalidatePath('/qa/actions'); revalidatePath('/action-items');
  redirect('/qa/actions?ok=' + encodeURIComponent('Improvement action saved. The owner sees it on their to-do list.'));
}
