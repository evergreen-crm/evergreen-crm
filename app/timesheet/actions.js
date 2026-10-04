'use server';
// Timesheets: clock in / out, fix, approve.
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

export async function clockIn(formData) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: open } = await supabase.from('time_entries').select('id').eq('profile_id', user.id).is('clock_out', null).maybeSingle();
  if (open) throw new Error('You are already clocked in.');
  const { error } = await supabase.from('time_entries').insert({
    profile_id: user.id, home_id: text(formData, 'home_id') ?? profile.home_id, notes: text(formData, 'notes'),
  });
  if (error) throw new Error('Could not clock in: ' + error.message);
  revalidatePath('/timesheet');
}

export async function clockOut(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const patch = { clock_out: new Date().toISOString(), break_minutes: Number(text(formData, 'break_minutes') ?? 0) };
  const notes = text(formData, 'notes');
  if (notes) patch.notes = notes;
  const { error } = await supabase.from('time_entries').update(patch).eq('id', text(formData, 'id')).eq('profile_id', user.id);
  if (error) throw new Error('Could not clock out: ' + error.message);
  revalidatePath('/timesheet');
}

// Add a missed punch by hand (Vancouver time). Managers can add for anyone.
export async function addTime(formData) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isMgr = ['admin', 'manager'].includes(profile.role);
  const who = isMgr ? (text(formData, 'profile_id') ?? user.id) : user.id;
  const date = text(formData, 'date');
  const toTs = (d, t) => {
    // Interpret as Vancouver local time.
    const guess = new Date(`${d}T${t}:00Z`);
    const local = new Date(guess.toLocaleString('en-US', { timeZone: 'America/Vancouver' }));
    const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
    return new Date(guess.getTime() + (utc - local)).toISOString();
  };
  const start = toTs(date, text(formData, 'start'));
  let end = toTs(date, text(formData, 'end'));
  if (end <= start) end = new Date(new Date(end).getTime() + 86400000).toISOString();
  const { error } = await supabase.from('time_entries').insert({
    profile_id: who, home_id: text(formData, 'home_id'), clock_in: start, clock_out: end,
    break_minutes: Number(text(formData, 'break_minutes') ?? 0),
    notes: text(formData, 'notes') ?? 'Added by hand',
  });
  if (error) throw new Error('Could not add: ' + error.message);
  revalidatePath('/timesheet');
}

export async function approveTime(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager']);
  const ids = formData.getAll('id');
  const { error } = await supabase.from('time_entries')
    .update({ approved_by: user.id, approved_at: new Date().toISOString() })
    .in('id', ids).not('clock_out', 'is', null);
  if (error) throw new Error('Could not approve: ' + error.message);
  revalidatePath('/timesheet');
}

export async function deleteTime(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const { error } = await supabase.from('time_entries').delete().eq('id', text(formData, 'delete_id'));
  if (error) throw new Error('Could not remove: ' + error.message);
  revalidatePath('/timesheet');
}
