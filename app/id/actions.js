'use server';
// Digital ID card: photo, location notice, clock in / check in / clock out with location,
// and the manager steps (approve photo, issue / renew, replace the QR code).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { CARD_VALID_MONTHS } from '@/lib/idcard';
import { addMonthsISO } from '@/lib/onboarding';
import { todayISO } from '@/lib/options';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function refresh(profileId) {
  revalidatePath('/id');
  revalidatePath('/onboarding');
  revalidatePath('/checkins');
  revalidatePath('/timesheet');
  if (profileId) revalidatePath(`/hr/${profileId}`);
}

// ---------- Staff ----------
export async function submitIdPhoto(path) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.rpc('submit_id_photo', { path });
  if (error) return { error: error.message };
  refresh(user.id);
  return { ok: true };
}

export async function ackLocationNotice() {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.rpc('ack_location_notice');
  if (error) throw new Error(error.message);
  refresh();
}

// kind: 'Clock in' | 'Check-in' | 'Clock out'. loc: { lat, lng, accuracy } or null if the phone refused.
export async function recordShiftEvent({ kind, loc, homeId, note, breakMinutes }) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: open } = await supabase.from('time_entries').select('id, home_id')
    .eq('profile_id', user.id).is('clock_out', null).maybeSingle();
  let entryId = open?.id ?? null;
  const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : null;

  if (kind === 'Clock in') {
    if (open) return { error: 'You are already clocked in.' };
    const { data, error } = await supabase.from('time_entries')
      .insert({ profile_id: user.id, home_id: homeId || profile.home_id, notes: cleanNote }).select('id').single();
    if (error) return { error: 'Could not clock in: ' + error.message };
    entryId = data.id;
  } else if (!open) {
    return { error: 'You are not clocked in.' };
  }

  const { data: row, error: cErr } = await supabase.from('location_checkins').insert({
    profile_id: user.id, time_entry_id: entryId, kind, note: cleanNote,
    lat: num(loc?.lat), lng: num(loc?.lng), accuracy_m: loc?.accuracy != null ? Math.round(loc.accuracy) : null,
  }).select('distance_m, on_site').single();
  if (cErr) return { error: 'Could not save check-in: ' + cErr.message };

  if (kind === 'Clock out') {
    const { error } = await supabase.from('time_entries')
      .update({ clock_out: new Date().toISOString(), break_minutes: Math.max(0, Number(breakMinutes) || 0) })
      .eq('id', entryId).eq('profile_id', user.id);
    if (error) return { error: 'Could not clock out: ' + error.message };
  }
  refresh(user.id);
  return { ok: true, distance: row?.distance_m ?? null, onSite: row?.on_site ?? null };
}

// ---------- Managers ----------
export async function reviewIdPhoto(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const pid = text(formData, 'profile_id');
  const decision = text(formData, 'decision');
  const note = text(formData, 'note');
  if (decision === 'return' && !note) redirect(`/hr/${pid}?idmsg=${encodeURIComponent('Add a note saying what to fix in the photo.')}#id-card`);
  const { error } = await supabase.from('id_cards')
    .update({ photo_status: decision === 'approve' ? 'Approved' : 'Returned', photo_note: note }).eq('profile_id', pid);
  if (error) throw new Error('Could not save: ' + error.message);
  refresh(pid);
}

export async function issueIdCard(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const pid = text(formData, 'profile_id');
  const today = todayISO();
  const months = Number(text(formData, 'months') ?? CARD_VALID_MONTHS) || CARD_VALID_MONTHS;
  const { data: card } = await supabase.from('id_cards').select('photo_status').eq('profile_id', pid).maybeSingle();
  if (card?.photo_status !== 'Approved') redirect(`/hr/${pid}?idmsg=${encodeURIComponent('Approve a photo before issuing the card.')}#id-card`);
  const { error } = await supabase.from('id_cards')
    .update({ issued_on: today, expires_on: addMonthsISO(today, months) }).eq('profile_id', pid);
  if (error) throw new Error('Could not issue card: ' + error.message);
  refresh(pid);
}

// Lost phone / printed card: a new QR code, and the old one stops working.
export async function replaceIdQr(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const pid = text(formData, 'profile_id');
  const { error } = await supabase.from('id_cards').update({ token: crypto.randomUUID() }).eq('profile_id', pid);
  if (error) throw new Error('Could not replace: ' + error.message);
  refresh(pid);
}
