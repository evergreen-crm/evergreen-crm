'use server';
// Pay rates: one hourly rate per position. Only the Executive Director, CSO, CEO and Administrator change them
// (checked again by the database). Saving a rate sends any offer letters that were waiting for it.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { emailOfferLink } from '@/lib/offerEmail';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const go = (msg, bad) => redirect(`/hr/pay-rates?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);

export async function savePayRate(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const position = text(fd, 'position');
  const raw = text(fd, 'rate');
  const rate = raw == null ? null : Number(raw);
  if (!position) go('Enter the position name.', true);
  if (rate != null && !(rate > 0)) go('Enter the hourly rate as a number, for example 27.50.', true);
  const { data, error } = await supabase.rpc('set_pay_rate', { p_position: position, p_rate: rate, p_active: fd.get('active') !== '0' });
  if (error) go(error.message, true);
  const sent = data?.sent ?? [];
  for (const id of sent) await emailOfferLink(id);
  revalidatePath('/hr/pay-rates');
  go(`Saved ${position}.${sent.length ? ` ${sent.length} waiting offer ${sent.length === 1 ? 'letter was' : 'letters were'} sent.` : ''}`);
}
