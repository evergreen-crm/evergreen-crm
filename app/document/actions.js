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

// The medication sheet: every dose on one sheet. Each row is a dose (or an as-needed dose).
// Rows left blank are not saved. A dose not given needs a reason. Nothing is saved unless every filled row is complete.
export async function saveMarSheet(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const residentId = String(formData.get('resident_id') ?? '');
  const date = String(formData.get('admin_date') ?? '');
  const path = String(formData.get('path') ?? '/document');
  const rows = [];
  const problems = [];
  for (const [key, value] of formData.entries()) {
    const [tag, medId, slot] = String(key).split('|');
    if (tag !== 'mar' || typeof value !== 'string' || !value) continue;
    const prn = slot === 'prn';
    const reason = String(formData.get(`reason|${medId}|${slot}`) ?? '').trim() || null;
    const time = prn ? String(formData.get(`time|${medId}|prn`) ?? '') || null : slot;
    if ((value !== 'Given' || prn) && !reason) { problems.push(prn ? 'an as-needed dose needs a reason' : 'a dose not given needs a reason'); continue; }
    rows.push({ medication_id: medId, resident_id: residentId, admin_date: date, scheduled_time: prn ? null : time, status: value, reason, given_by: user.id });
  }
  if (problems.length) throw new Error(`Nothing was saved. Please fix: ${[...new Set(problems)].join('; ')}.`);
  if (rows.length) {
    const { error } = await supabase.from('med_administrations').insert(rows);
    if (error) throw new Error(error.code === '23505' ? 'One of these doses was already signed. Refresh and try again.' : 'Could not save: ' + error.message);
  }
  revalidatePath(path.split('?')[0]);
}
