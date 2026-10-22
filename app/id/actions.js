'use server';
// Digital ID card: photo, location notice, clock in / check in / clock out with location,
// and the manager steps (approve photo, issue / renew, replace the QR code).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser, requireHR } from '@/lib/auth';
import { CARD_VALID_MONTHS } from '@/lib/idcard';
import { addMonthsISO } from '@/lib/onboarding';
import { todayISO } from '@/lib/options';
import { after } from 'next/server';
import { flushOutbox } from '@/lib/emailOutbox';

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
  const { supabase } = await requireHR();
  const pid = text(formData, 'profile_id');
  const decision = text(formData, 'decision');
  const note = text(formData, 'note');
  if (decision === 'return' && !note) redirect(`/hr/${pid}?idmsg=${encodeURIComponent('Add a note saying what to fix in the photo.')}#id-card`);
  const { data: card } = await supabase.from('id_cards').select('photo_path, new_photo_path, new_photo_status').eq('profile_id', pid).maybeSingle();
  let patch;
  if (card?.new_photo_status === 'Pending' && card.new_photo_path) {
    // A replacement photo for a card that is already in use.
    patch = decision === 'approve'
      ? { photo_path: card.new_photo_path, photo_status: 'Approved', photo_note: null, new_photo_path: null, new_photo_status: null, new_photo_note: null }
      : { new_photo_status: 'Returned', new_photo_note: note };
  } else {
    patch = { photo_status: decision === 'return' ? 'Returned' : 'Approved', photo_note: decision === 'return' ? note : null };
    if (decision === 'approve_issue') {
      const today = todayISO();
      const months = Number(text(formData, 'months') ?? CARD_VALID_MONTHS) || CARD_VALID_MONTHS;
      patch.issued_on = today;
      patch.expires_on = addMonthsISO(today, months);
    }
  }
  const { error } = await supabase.from('id_cards').update(patch).eq('profile_id', pid);
  if (error) redirect(`/hr/${pid}?idmsg=${encodeURIComponent('Could not save: ' + error.message)}#id-card`);
  // Remove the old photo file once a replacement is approved (keeps storage small).
  if (patch.new_photo_path === null && card?.photo_path && card.photo_path !== card.new_photo_path) {
    await supabase.storage.from('id-photos').remove([card.photo_path]);
  }
  refresh(pid);
  const done = decision === 'return' ? 'Sent back — they’ll be asked for a new photo.'
    : decision === 'approve_issue' ? 'Photo approved and ID card issued.' : 'Photo approved.';
  redirect(`/hr/${pid}?idok=1&idmsg=${encodeURIComponent(done)}#id-card`);
}

export async function issueIdCard(formData) {
  const { supabase } = await requireHR();
  const pid = text(formData, 'profile_id');
  const today = todayISO();
  const months = Number(text(formData, 'months') ?? CARD_VALID_MONTHS) || CARD_VALID_MONTHS;
  const { data: card } = await supabase.from('id_cards').select('photo_status').eq('profile_id', pid).maybeSingle();
  if (card?.photo_status !== 'Approved') redirect(`/hr/${pid}?idmsg=${encodeURIComponent('Approve a photo before issuing the card.')}#id-card`);
  const { error } = await supabase.from('id_cards')
    .update({ issued_on: today, expires_on: addMonthsISO(today, months) }).eq('profile_id', pid);
  if (error) redirect(`/hr/${pid}?idmsg=${encodeURIComponent('Could not issue card: ' + error.message)}#id-card`);
  refresh(pid);
  redirect(`/hr/${pid}?idok=1&idmsg=${encodeURIComponent('ID card issued.')}#id-card`);
}

// HR prints the plastic card: record which staff ID number is on it. A later change to the number shows "Reprint needed".
export async function markCardPrinted(formData) {
  const { supabase } = await requireHR();
  const pid = text(formData, 'profile_id');
  const { data: d } = await supabase.from('staff_details').select('employee_no').eq('profile_id', pid).maybeSingle();
  const { error } = await supabase.from('id_cards').update({ printed_no: d?.employee_no ?? null, printed_on: todayISO() }).eq('profile_id', pid);
  if (error) redirect(`/hr/${pid}?idmsg=${encodeURIComponent('Could not save: ' + error.message)}#id-card`);
  refresh(pid);
  redirect(`/hr/${pid}?idok=1&idmsg=${encodeURIComponent('Marked as printed with ' + (d?.employee_no ?? 'no number') + '.')}#id-card`);
}

// Lost phone / printed card: a new QR code, and the old one stops working.
export async function replaceIdQr(formData) {
  const { supabase } = await requireHR();
  const pid = text(formData, 'profile_id');
  const { error } = await supabase.from('id_cards').update({ token: crypto.randomUUID() }).eq('profile_id', pid);
  if (error) throw new Error('Could not replace: ' + error.message);
  refresh(pid);
}

// ---------- Safe clock in / clock out, permission requests, emergency (supabase/safe-shifts.sql) ----------
const NOT_ON = 'Safe clock in and out isn’t switched on yet. Please tell the office (setup file: safe-shifts.sql).';
const clean = (e) => (/does not exist|Could not find the function/i.test(e?.message ?? '') ? NOT_ON : (e?.message ?? 'Something went wrong.').replace(/^.*?ERROR:\s*/, ''));
const L = (loc) => ({ p_lat: num(loc?.lat), p_lng: num(loc?.lng), p_acc: loc?.accuracy != null ? Math.round(loc.accuracy) : null });

export async function clockInSafe({ homeId, loc, note }) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('clock_in_safely', { p_home: homeId || profile.home_id, ...L(loc), p_note: note || null });
  if (error) return { error: clean(error) };
  refresh(user.id); revalidatePath('/portal'); revalidatePath('/checklist');
  return data;
}

export async function clockOutSafe({ loc, answers, breakMinutes, note }) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  after(() => flushOutbox('urgent').catch(() => null)); // injury / permission emails (Step 7)
  const { data, error } = await supabase.rpc('clock_out_safely', { ...L(loc), p_answers: answers ?? {}, p_break: Math.max(0, Number(breakMinutes) || 0), p_note: note || null });
  if (error) return { error: clean(error) };
  refresh(user.id); revalidatePath('/portal'); revalidatePath('/todo');
  return data;
}

export async function askShiftPermission({ kind, homeId, reasons, note, loc }) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  after(() => flushOutbox('urgent').catch(() => null));
  const { error } = await supabase.rpc('request_shift_permission', { p_kind: kind, p_home: homeId || null, p_reasons: reasons ?? [], p_note: note ?? '', ...L(loc) });
  if (error) return { error: clean(error) };
  refresh(user.id);
  return { ok: true };
}

export async function raiseEmergency({ kind, note, loc }) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  after(() => flushOutbox('urgent').catch(() => null)); // 🆘 emails go out right after the alert is saved
  const { data, error } = await supabase.rpc('raise_emergency', { p_kind: kind, p_note: note || null, ...L(loc) });
  if (error) return { error: clean(error) };
  revalidatePath('/approvals');
  return { ok: true, id: data };
}
