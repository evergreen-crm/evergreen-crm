'use server';
import { fail } from '@/lib/fail';
// Shift schedule: saving.
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { addDaysISO } from '@/lib/options';

// Row-level security refuses a house the person doesn't schedule; say it plainly.
const why = (e) => (/row-level security/i.test(e.message) ? 'You can only add or change shifts for the house you schedule.' : e.message);

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

export async function addShift(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const repeat = Math.min(Number(text(formData, 'repeat') ?? 1), 14);
  const date = text(formData, 'shift_date');
  const rows = Array.from({ length: repeat }, (_, i) => ({
    home_id: text(formData, 'home_id'),
    profile_id: text(formData, 'profile_id'),
    shift_date: addDaysISO(date, i),
    start_time: text(formData, 'start_time'),
    end_time: text(formData, 'end_time'),
    label: text(formData, 'label'),
    notes: text(formData, 'notes'),
    night_role: text(formData, 'night_role'),
    created_by: user.id,
  }));
  const { error } = await supabase.from('shifts').insert(rows);
  if (error) await fail('Could not add shift: ' + why(error));
  revalidatePath('/schedule');
}

export async function deleteShift(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.from('shifts').delete().eq('id', text(formData, 'id'));
  if (error) await fail('Could not remove shift: ' + why(error));
  revalidatePath('/schedule');
}

// Copy every shift from last week into this week (same house).
export async function copyLastWeek(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const homeId = text(formData, 'home_id');
  const week = text(formData, 'week');
  const { data: last } = await supabase.from('shifts').select('*').eq('home_id', homeId)
    .gte('shift_date', addDaysISO(week, -7)).lte('shift_date', addDaysISO(week, -1));
  if (!last?.length) return;
  const rows = last.map((s) => ({
    home_id: s.home_id, profile_id: s.profile_id, shift_date: addDaysISO(s.shift_date, 7),
    start_time: s.start_time, end_time: s.end_time, label: s.label, notes: s.notes, created_by: user.id,
  }));
  const { error } = await supabase.from('shifts').insert(rows);
  if (error) await fail('Could not copy: ' + why(error));
  revalidatePath('/schedule');
}
