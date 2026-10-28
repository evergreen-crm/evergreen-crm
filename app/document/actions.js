'use server';
// Goal steps: add a step, and tick it when done.
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(new Date());

export async function addGoalStep(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const goalId = String(formData.get('goal_id') ?? '');
  const step = String(formData.get('step') ?? '').trim();
  const path = String(formData.get('path') ?? '/document');
  if (!goalId || !step) throw new Error('Write the step first.');
  const { error } = await supabase.from('goal_steps').insert({ goal_id: goalId, step });
  if (error) throw new Error('Could not add the step: ' + error.message);
  revalidatePath(path.split('?')[0]);
}

export async function toggleGoalStep(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = String(formData.get('id') ?? '');
  const done = formData.get('done') === 'yes';
  const path = String(formData.get('path') ?? '/document');
  const { error } = await supabase.from('goal_steps').update({ done_on: done ? today() : null }).eq('id', id);
  if (error) throw new Error('Could not update the step: ' + error.message);
  revalidatePath(path.split('?')[0]);
}
