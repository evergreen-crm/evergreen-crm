'use server';
// Career ladder & promotions. Management steps (Program Coordinator and up) need 24 months,
// 2 satisfactory reviews and a Board of Directors decision — enforced in the database.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { todayISO } from '@/lib/options';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const back = (msg, bad) => redirect(`/careers?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}#requests`);

export async function requestPromotion(fd) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const to = Number(text(fd, 'to_step')); const from = text(fd, 'from_step');
  const { data: open } = await supabase.from('staff_promotions').select('id').eq('staff_id', user.id).in('status', ['Requested', 'Recommended', 'Board review']);
  if (open?.length) back('You already have a promotion review in progress.', true);
  const { error } = await supabase.from('staff_promotions').insert({ staff_id: user.id, from_step: from ? Number(from) : null, to_step: to, status: 'Requested', evidence: text(fd, 'evidence') });
  if (error) back(error.message, true);
  revalidatePath('/careers');
  back('Request sent. A Program Manager will review it with you.');
}

export async function decidePromotion(fd) {
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const lvl = levelOf(profile);
  const id = text(fd, 'id'); const op = text(fd, 'op');
  const patch = {};
  const reviews = text(fd, 'satisfactory_reviews');
  if (reviews !== null) patch.satisfactory_reviews = Number(reviews);
  const months = text(fd, 'months_at_evergreen');
  if (months !== null) patch.months_at_evergreen = Number(months);
  if (text(fd, 'evidence')) patch.evidence = text(fd, 'evidence');
  switch (op) {
    case 'recommend': patch.status = 'Recommended'; patch.recommended_by = profile.id; break;
    case 'board': patch.status = 'Board review'; break;
    case 'approve': patch.status = 'Approved'; patch.approved_by = profile.id; patch.decided_on = todayISO(); break;
    case 'decline': patch.status = 'Declined'; patch.approved_by = profile.id; patch.decided_on = todayISO(); break;
    case 'board_approve': case 'board_decline':
      if (lvl < 7) back('Only the CEO or an Administrator can record a Board decision.', true);
      patch.status = op === 'board_approve' ? 'Approved' : 'Declined';
      patch.board_meeting_date = text(fd, 'board_meeting_date'); patch.board_reference = text(fd, 'board_reference');
      patch.approved_by = profile.id; break;
    default: back('Unknown action.', true);
  }
  const { data, error } = await supabase.from('staff_promotions').update(patch).eq('id', id).select('id');
  if (error) back(error.message, true);
  if (!data?.length) back('Not saved — you can’t decide your own request.', true);
  revalidatePath('/careers');
  back({ recommend: 'Recommended.', board: 'Sent to the Board of Directors for review.', approve: 'Promotion approved.', decline: 'Request declined.', board_approve: 'Board decision recorded — approved.', board_decline: 'Board decision recorded — declined.' }[op]);
}
