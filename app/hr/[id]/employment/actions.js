'use server';
// Job and offer letter: saving a person's position, full-time / part-time, hours and start date writes their
// offer letter and sends it to them to sign (supabase/auto-offer.sql). The database checks who may do this.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { emailOfferLink } from '@/lib/offerEmail';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const go = (id, msg, bad) => redirect(`/hr/${id}/employment?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);

// What to tell the person who saved, for each result of auto_offer().
function offerMessage(res, mailed) {
  const s = res?.status;
  if (s === 'sent') return `Saved. The offer letter was written and sent to them to sign${mailed ? ', with an email link' : ' (they will see it in their portal alerts)'}.`;
  if (s === 'waiting_rate') return 'Saved. The offer letter is ready, but this position has no pay rate yet. The Executive Director, CSO, CEO and Administrator were told; it is sent automatically when the rate is set.';
  if (s === 'unchanged') return res.offer_status === 'Accepted' ? 'Saved. Their signed offer letter already has these terms.' : 'Saved. Their offer letter already has these terms.';
  if (res?.why === 'manual') return 'Saved. An offer letter written by hand is already open for them, so no automatic letter was made.';
  if (res?.why === 'incomplete') return 'Saved. No offer letter yet: choose the position, full-time or part-time, and the start date.';
  return 'Saved.';
}

export async function saveJob(fd) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(fd, 'profile_id');
  if (!id) redirect('/');
  if (id === user.id) go(id, 'You can’t set up your own job or offer letter.', true);
  const type = text(fd, 'employment_type');
  const hoursRaw = text(fd, 'hours_per_week');
  const hours = hoursRaw == null ? null : Number(hoursRaw);
  if (!text(fd, 'position')) go(id, 'Choose the position.', true);
  if (!['Full-time', 'Part-time'].includes(type)) go(id, 'Choose full-time or part-time.', true);
  if (!text(fd, 'hire_date')) go(id, 'Enter the start date.', true);
  if (hours != null && !(hours > 0 && hours <= 60)) go(id, 'Hours each week must be between 1 and 60.', true);
  const { data, error } = await supabase.from('staff_details').upsert({
    profile_id: id, position: text(fd, 'position'), employment_type: type, hours_per_week: hours,
    hire_date: text(fd, 'hire_date'), updated_at: new Date().toISOString(),
  }).select('profile_id');
  if (error || !data?.length) go(id, error?.message ?? 'You can only set this up for staff in your own house.', true);
  const { data: res, error: e2 } = await supabase.rpc('auto_offer', { p_profile: id });
  if (e2) go(id, `The job was saved, but the offer letter was not made: ${e2.message}`, true);
  const mailed = res?.status === 'sent' ? await emailOfferLink(res.id) : false;
  revalidatePath(`/hr/${id}`);
  revalidatePath(`/hr/${id}/employment`);
  go(id, offerMessage(res, mailed));
}

// After the browser uploaded a file to <person>/paperwork/offers/: record it as the next version (never replaces one).
export async function recordOfferUpload({ profileId, path, name, size, note }) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('add_offer_upload', {
    p_profile: profileId, p_path: path, p_name: name, p_size: Number(size) || null, p_note: typeof note === 'string' ? note : null });
  if (error) return { error: error.message };
  revalidatePath(`/hr/${profileId}/employment`);
  return { ok: true, version: data?.version };
}
