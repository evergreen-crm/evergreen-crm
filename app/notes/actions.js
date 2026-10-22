'use server';
// Quick daily notes: save (new or my own draft), sign, sign all, and open the incident report if something serious happened.
// When every person at the house has my signed note this shift, the checklist item "Daily note for each person" ticks itself.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { todayISO } from '@/lib/options';
import { notesForShift } from '@/lib/checklist';

const s = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null; };
const SHIFTS = ['Day', 'Evening', 'Night'];

async function autoTickNotes(supabase, userId) {
  try {
    const { data: cl } = await supabase.from('shift_checklists').select('id, home_id, starts_at').eq('profile_id', userId).eq('status', 'Open')
      .gte('ends_at', new Date(Date.now() - 2 * 3600e3).toISOString()).order('starts_at', { ascending: false }).limit(1).maybeSingle();
    if (!cl) return;
    const n = await notesForShift(supabase, { homeId: cl.home_id, userId, since: new Date(new Date(cl.starts_at).getTime() - 3600e3).toISOString() });
    if (n.total && !n.missing.length) {
      await supabase.from('shift_checklist_ticks').update({ status: 'Done', note: null }).eq('checklist_id', cl.id).eq('code', 'X1').is('status', null);
    }
  } catch {}
}

export async function saveNote(fd) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const rid = s(fd, 'resident_id');
  const home = s(fd, 'home_id');
  const sign = fd.get('sign') === 'yes';
  const note = s(fd, 'note');
  const toResident = fd.get('return') === 'resident';
  const back = (q) => redirect(toResident ? `/residents/${rid}?tab=notes&${q.replace(/#.*$/, '')}` : `/notes?${home ? `home=${home}&` : ''}${q}`);
  if (!note) back(`error=${encodeURIComponent('Write the note first.')}#r-${rid}`);
  const row = {
    shift: SHIFTS.includes(s(fd, 'shift')) ? s(fd, 'shift') : 'Day',
    mood: s(fd, 'mood'), meals: s(fd, 'meals'), activities: s(fd, 'activities'), note,
    share_with_family: fd.get('share_with_family') === 'on',
    signed_at: sign ? new Date().toISOString() : null,
  };
  const id = s(fd, 'note_id');
  const { error } = id
    ? await supabase.from('shift_notes').update(row).eq('id', id).eq('author_id', user.id).is('signed_at', null)
    : await supabase.from('shift_notes').insert({ ...row, resident_id: rid, author_id: user.id, note_date: todayISO() });
  if (error) back(`error=${encodeURIComponent('Could not save the note: ' + error.message)}#r-${rid}`);
  if (sign) await autoTickNotes(supabase, user.id);
  revalidatePath('/notes'); revalidatePath(`/residents/${rid}`); revalidatePath('/portal'); revalidatePath('/checklist');
  if (fd.get('serious') === 'on') redirect(`/residents/${rid}?tab=incidents&new=1`);
  const next = s(fd, 'next');
  back(`saved=${rid}&ok=${encodeURIComponent(sign ? 'Note signed.' : 'Draft saved — remember to sign it before you leave.')}#r-${sign && next ? next : rid}`);
}

export async function signAllMine(fd) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const home = s(fd, 'home_id');
  const since = new Date(Date.now() - 18 * 3600e3).toISOString();
  const { data, error } = await supabase.from('shift_notes').update({ signed_at: new Date().toISOString() })
    .eq('author_id', user.id).is('signed_at', null).gte('created_at', since).select('id');
  const q = home ? `home=${home}&` : '';
  if (error) redirect(`/notes?${q}error=${encodeURIComponent(error.message)}`);
  await autoTickNotes(supabase, user.id);
  revalidatePath('/notes'); revalidatePath('/portal'); revalidatePath('/checklist');
  redirect(`/notes?${q}ok=${encodeURIComponent(`${data?.length ?? 0} note${data?.length === 1 ? '' : 's'} signed.`)}`);
}
