'use server';
// Approve or decline a clock in / clock out request, and close an emergency alert.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const s = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null; };
const back = (msg, bad) => redirect(`/approvals?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);

export async function decideRequest(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const approve = fd.get('decision') === 'approve';
  const { error } = await supabase.rpc('decide_shift_permission', { p_id: s(fd, 'id'), p_approve: approve, p_note: s(fd, 'note') });
  if (error) back(error.message, true);
  revalidatePath('/approvals'); revalidatePath('/portal'); revalidatePath('/todo');
  back(approve ? 'Approved — they’ve been told they can go ahead.' : 'Declined — they’ve been told.');
}

export async function resolveAlert(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.rpc('resolve_emergency', { p_id: s(fd, 'id'), p_note: s(fd, 'note') });
  if (error) back(error.message, true);
  revalidatePath('/approvals'); revalidatePath('/portal'); revalidatePath('/todo');
  back('Emergency marked as handled.');
}
