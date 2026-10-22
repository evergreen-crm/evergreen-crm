'use server';
// Automatic schedule (supabase/schedule-teams.sql): teams and lines, open shifts, swaps, time off, protected days.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const s = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null; };
const int = (fd, k) => Math.max(0, Math.min(4, Number(s(fd, k) ?? 0) || 0));
const NOT_ON = 'The automatic schedule isn’t switched on yet. Please tell the office (setup file: schedule-teams.sql).';
const msg = (e) => (/does not exist|Could not find the function/i.test(e?.message ?? '') ? NOT_ON : e.message);
function back(tab, text, bad, extra = '') {
  revalidatePath('/schedule'); revalidatePath('/todo');
  redirect(`/schedule?tab=${tab}${extra}&${bad ? 'error' : 'ok'}=${encodeURIComponent(text)}`);
}

export async function saveStaffing(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const home = s(fd, 'home_id');
  const { data, error } = await supabase.rpc('save_house_staffing', {
    p_home: home, p_day: int(fd, 'staff_day'), p_evening: int(fd, 'staff_evening'), p_night: Math.min(2, int(fd, 'staff_night')),
    p_peak: Math.min(2, int(fd, 'staff_peak')), p_from: s(fd, 'schedule_from'),
  });
  if (error) back('teams', msg(error), true, `&home=${home}`);
  back('teams', `Saved. ${data ?? 0} new shifts posted for the next 6 months.`, false, `&home=${home}`);
}

export async function assignLine(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const home = s(fd, 'home_id');
  const { error } = await supabase.rpc('assign_line', { p_line: s(fd, 'line_id'), p_profile: s(fd, 'profile_id') });
  if (error) back('teams', msg(error), true, `&home=${home}`);
  back('teams', s(fd, 'profile_id') ? 'Assigned. Their shifts for the next 6 months are posted and they’ve been told.' : 'Removed from the line. Their future shifts are now open.', false, `&home=${home}`);
}

export async function pickUp(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('pick_up_shift', { p_shift: s(fd, 'shift_id') });
  if (error) back(s(fd, 'tab') ?? 'open', msg(error), true);
  back(s(fd, 'tab') ?? 'open', data === 'taken' ? 'The shift is yours. It’s on your schedule now.' : 'Asked. The Program Coordinator will approve the swap.');
}

export async function offerShift(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const offer = fd.get('offer') === '1';
  const { error } = await supabase.rpc('offer_shift', { p_shift: s(fd, 'shift_id'), p_offer: offer, p_note: s(fd, 'note') });
  if (error) back('mine', msg(error), true);
  back('mine', offer ? 'Offered. Coworkers can ask to take it; you keep it until the swap is approved.' : 'You’re keeping this shift.');
}

export async function decidePickup(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const ok = fd.get('decision') === 'approve';
  const { error } = await supabase.rpc('decide_pickup', { p_id: s(fd, 'id'), p_approve: ok });
  if (error) back('open', msg(error), true);
  back('open', ok ? 'Swap approved.' : 'Swap declined.');
}

export async function requestTimeOff(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const start = s(fd, 'start_date');
  const { error } = await supabase.rpc('request_time_off', { p_start: start, p_end: s(fd, 'end_date') ?? start, p_kind: s(fd, 'kind') ?? 'Vacation', p_note: s(fd, 'note') });
  if (error) back('timeoff', msg(error), true);
  back('timeoff', 'Sent to your Program Coordinator. You’ll get an alert when it’s decided.');
}

export async function decideTimeOff(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const ok = fd.get('decision') === 'approve';
  const { data, error } = await supabase.rpc('decide_time_off', { p_id: s(fd, 'id'), p_approve: ok, p_note: s(fd, 'note') });
  if (error) back('timeoff', msg(error), true);
  back('timeoff', ok ? `Approved. ${data ?? 0} of their shifts are now open shifts for the pick-up pool.` : fd.get('decision') === 'cancel' ? 'Cancelled.' : 'Declined.');
}

export async function addProtectedDay(fd) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.from('protected_days').insert({ profile_id: user.id, day: s(fd, 'day') });
  if (error) back('mine', /duplicate/i.test(error.message) ? 'That day is already protected.' : msg(error), true);
  back('mine', 'Protected. You won’t be asked to pick up shifts that day.');
}

export async function removeProtectedDay(fd) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  await supabase.from('protected_days').delete().eq('profile_id', user.id).eq('day', s(fd, 'day'));
  back('mine', 'Removed.');
}
