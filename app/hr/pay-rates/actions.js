'use server';
// Pay setup with approval: Payroll enters a change (pay type, grid level / hourly rate / annual salary, per program);
// a leader at level 4 to 8 approves or rejects it. Only approved changes are used. The database checks every rule.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { emailOfferLink } from '@/lib/offerEmail';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const num = (fd, k) => { const v = text(fd, k); return v == null ? null : Number(v.replace(/[$,\s]/g, '')); };
const go = (msg, bad) => redirect(`/hr/pay-rates?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);

export async function requestPayChange(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const payType = text(fd, 'pay_type') === 'salary' ? 'salary' : 'hourly';
  const level = num(fd, 'grid_level');
  const p = {
    kind: 'plan', position: text(fd, 'position'), program: text(fd, 'program') ?? 'All', pay_type: payType,
    grid_level: payType === 'hourly' && level ? level : null,
    hourly_rate: payType === 'hourly' && !level ? num(fd, 'hourly_rate') : null,
    annual_salary: payType === 'salary' ? num(fd, 'annual_salary') : null,
    note: text(fd, 'note'),
  };
  if (p.hourly_rate != null && !(p.hourly_rate > 0)) go('Enter the hourly rate as a number, for example 30.22.', true);
  if (p.annual_salary != null && !(p.annual_salary > 0)) go('Enter the annual salary as a number, for example 72000.', true);
  const { error } = await supabase.rpc('request_pay_change', { p });
  if (error) go(error.message, true);
  revalidatePath('/hr/pay-rates');
  go(`Sent for approval: ${p.position} (${p.program === 'All' ? 'all programs' : p.program}). A director at level 4 to 8 will approve it.`);
}

export async function decidePayChange(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(fd, 'id');
  const approve = text(fd, 'decision') === 'approve';
  const { data, error } = await supabase.rpc('decide_pay_change', { p_id: id, p_approve: approve, p_note: text(fd, 'note') });
  if (error) go(error.message, true);
  for (const oid of data?.sent ?? []) await emailOfferLink(oid);
  revalidatePath('/hr/pay-rates'); revalidatePath('/hr/wage-grid');
  go(`${approve ? 'Approved' : 'Rejected'}.${data?.sent?.length ? ` ${data.sent.length} waiting offer letter(s) sent.` : ''}`);
}

export async function cancelPayChange(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.rpc('cancel_pay_change', { p_id: text(fd, 'id') });
  if (error) go(error.message, true);
  revalidatePath('/hr/pay-rates');
  go('Request cancelled.');
}
