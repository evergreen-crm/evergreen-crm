'use server';
// Shift duty checklists: tick items, log bed checks, sign; and (Program Coordinator / Manager) set up a house's list.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { expectedBedChecks, notesForShift, timesInOrder } from '@/lib/checklist';

const NOT_SET_UP = 'Shift checklists are not switched on yet. An administrator needs to run supabase/shift-checklists.sql in Supabase.';
const clean = (e) => (/does not exist|Could not find/i.test(e?.message ?? '') ? NOT_SET_UP : (e?.message ?? 'Something went wrong.').replace(/^.*?ERROR:\s*/, ''));
const s = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null; };

export async function startChecklist(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const home = s(fd, 'home_id');
  const { data, error } = await supabase.rpc('open_shift_checklist', { p_home: home });
  if (error) redirect(`/checklist?error=${encodeURIComponent(clean(error))}`);
  redirect(`/checklist?id=${data}`);
}

// Called from the item buttons (client). Returns { error } instead of throwing, so the page stays put.
export async function tickItem({ tickId, status, note }) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const { data: t } = await supabase.from('shift_checklist_ticks')
    .select('id, code, checklist_id, shift_checklists(id, home_id, profile_id, starts_at, bed_checks, homes(bed_check_minutes))').eq('id', tickId).maybeSingle();
  if (!t) return { error: 'Item not found.' };
  const c = t.shift_checklists;
  if (c?.profile_id !== user.id) return { error: 'This is not your checklist.' };
  if (status === 'Done' && t.code === 'N2') {
    const need = expectedBedChecks(c.homes?.bed_check_minutes ?? 30);
    const have = (c.bed_checks ?? []).length;
    if (have < need - 2) return { error: `Only ${have} of about ${need} bed checks are logged. Tap “Log a bed check” each time, or mark Problem and explain.` };
  }
  if (status === 'Done' && t.code === 'X1') {
    const since = new Date(new Date(c.starts_at).getTime() - 3600e3).toISOString();
    const n = await notesForShift(supabase, { homeId: c.home_id, userId: user.id, since });
    if (n.missing.length) return { error: `Daily note not signed yet for: ${n.missing.join(', ')}. Open Daily notes first.` };
  }
  const { error } = await supabase.from('shift_checklist_ticks')
    .update({ status: status || null, note: status === 'Done' || !status ? null : (note ?? '').trim().slice(0, 500) || null }).eq('id', tickId);
  if (error) return { error: clean(error) };
  revalidatePath('/checklist');
  return { ok: true };
}

export async function logBedCheck(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = s(fd, 'id');
  const { error } = await supabase.rpc('log_bed_check', { p_id: id });
  if (error) redirect(`/checklist?id=${id}&error=${encodeURIComponent(clean(error))}`);
  revalidatePath('/checklist');
  redirect(`/checklist?id=${id}&ok=${encodeURIComponent('Bed check logged at ' + new Date().toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: 'Etc/GMT+7' }))}#bedchecks`);
}

export async function signChecklist(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = s(fd, 'id');
  const { error } = await supabase.rpc('sign_shift_checklist', { p_id: id, p_initials: s(fd, 'initials') ?? '' });
  if (error) redirect(`/checklist?id=${id}&error=${encodeURIComponent(clean(error))}#sign`);
  revalidatePath('/checklist'); revalidatePath('/todo'); revalidatePath('/portal');
  redirect(`/checklist?id=${id}&ok=${encodeURIComponent('Signed. Thank you — your shift checklist is complete.')}`);
}

// ---------- House set-up (Program Coordinator for their house, Program Manager+ for any) ----------
async function leader() {
  const ctx = await requireUser(['admin', 'manager', 'staff']);
  if (levelOf(ctx.profile) < 2) redirect('/checklist?error=' + encodeURIComponent('Only the Program Coordinator or Program Manager can change the checklist.'));
  return ctx;
}
const back = (home, msg, bad) => redirect(`/checklist/setup?home=${home}&${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);

export async function saveHouseSettings(fd) {
  const { supabase } = await leader();
  const home = s(fd, 'home_id');
  const t = (k) => (/^\d{2}:\d{2}$/.test(s(fd, k) ?? '') ? s(fd, k) : null);
  const patch = { shift_day_start: t('day'), shift_evening_start: t('evening'), shift_night_start: t('night'),
    bed_check_minutes: Math.min(120, Math.max(10, Number(s(fd, 'bed') ?? 30) || 30)), med_count_required: fd.get('med_count') === 'on' };
  if (!patch.shift_day_start || !patch.shift_evening_start || !patch.shift_night_start) back(home, 'Enter all three shift start times.', true);
  if (!timesInOrder(patch.shift_day_start, patch.shift_evening_start, patch.shift_night_start)) back(home, 'Times must go in order around the day: Day, then Evening, then Night (Night may start at midnight).', true);
  const { error } = await supabase.rpc('save_house_shift_settings', { p_home: home, p_day: patch.shift_day_start, p_evening: patch.shift_evening_start,
    p_night: patch.shift_night_start, p_bed: patch.bed_check_minutes, p_med: patch.med_count_required });
  if (error) back(home, clean(error), true);
  revalidatePath('/checklist/setup');
  back(home, 'House shift settings saved. They apply from the next shift.');
}

export async function saveItem(fd) {
  const { supabase, user } = await leader();
  const home = s(fd, 'home_id'); const id = s(fd, 'id');
  const item = s(fd, 'item');
  if (!item) back(home, 'Write the duty.', true);
  const row = { item: item.slice(0, 240), shift: s(fd, 'shift') ?? 'Day', area: s(fd, 'area') ?? 'Care', critical: fd.get('critical') === 'on',
    weekday: s(fd, 'weekday') === null || s(fd, 'weekday') === '' ? null : Number(s(fd, 'weekday')), updated_by: user.id, updated_at: new Date().toISOString() };
  const { error } = id
    ? await supabase.from('house_checklist_items').update(row).eq('id', id)
    : await supabase.from('house_checklist_items').insert({ ...row, home_id: home, sort: Number(s(fd, 'sort') ?? 700) || 700 });
  if (error) back(home, clean(error), true);
  revalidatePath('/checklist/setup');
  back(home, id ? 'Duty updated.' : 'Duty added. It shows on checklists from the next shift.');
}

export async function toggleItem(fd) {
  const { supabase, user } = await leader();
  const home = s(fd, 'home_id');
  const { error } = await supabase.from('house_checklist_items')
    .update({ active: fd.get('active') === 'true', updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', s(fd, 'id'));
  if (error) back(home, clean(error), true);
  revalidatePath('/checklist/setup');
  back(home, fd.get('active') === 'true' ? 'Duty switched back on.' : 'Duty switched off for this house.');
}

export async function resetHouseList(fd) {
  const { supabase } = await leader();
  const home = s(fd, 'home_id');
  const { data, error } = await supabase.rpc('seed_house_checklist', { p_home: home });
  if (error) back(home, clean(error), true);
  back(home, data ? `${data} missing standard duties added back.` : 'All standard duties are already on this house’s list.');
}
