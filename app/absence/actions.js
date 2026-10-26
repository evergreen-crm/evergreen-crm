'use server';
// 📞 Can't make my shift and ⏰ Running late (supabase/attendance.sql). Urgent alerts go out by email straight away.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireUser } from '@/lib/auth';
import { flushOutbox } from '@/lib/emailOutbox';

const t = (fd, k, n = 300) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null; };
const NOT_ON = 'This isn’t switched on yet. Please phone your on-call supervisor (setup file: attendance.sql).';
const clean = (e) => (/does not exist|Could not find the function/i.test(e?.message ?? '') ? NOT_ON : (e?.message ?? 'Something went wrong.'));
const go = (q) => redirect('/absence?' + q);

export async function cantMakeShift(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const until = t(fd, 'until', 10);
  const { data, error } = await supabase.rpc('cant_make_shift', {
    p_shift: t(fd, 'shift_id', 40), p_kind: t(fd, 'kind', 30), p_note: t(fd, 'note'), p_until: /^\d{4}-\d{2}-\d{2}$/.test(until ?? '') ? until : null,
    p_pay: t(fd, 'pay', 20),
  });
  if (error) go('error=' + encodeURIComponent(clean(error)));
  after(() => flushOutbox('urgent').catch(() => null));
  revalidatePath('/absence'); revalidatePath('/schedule'); revalidatePath('/portal');
  const soon = data?.hours_notice !== null && data?.hours_notice !== undefined && Number(data.hours_notice) < 4;
  // Sick-day balances and paid / unpaid are for directors and Payroll only — not shown to staff.
  const payWords = data?.pay === 'Vacation' ? ' It will be recorded as vacation.' : data?.pay === 'Banked time' ? ' It will be recorded as banked time.' : '';
  const unpaidWords = '';
  const msg = `Done. ${data?.shifts > 1 ? `${data.shifts} shifts are` : 'Your shift is'} open now and your Program Coordinator and Program Manager were told.${payWords}${unpaidWords} Feel better soon.`;
  go('ok=' + encodeURIComponent(msg) + (soon ? `&call=${encodeURIComponent(data?.on_call_phone ?? '')}` : ''));
}

export async function runningLate(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('running_late', { p_shift: t(fd, 'shift_id', 40), p_minutes: Number(t(fd, 'minutes', 4)), p_note: t(fd, 'note') });
  if (error) go('error=' + encodeURIComponent(clean(error)));
  after(() => flushOutbox('urgent').catch(() => null));
  revalidatePath('/absence');
  go('ok=' + encodeURIComponent('Sent. Your Program Coordinator and Program Manager know you are on your way. Drive safely.') + (data?.on_call_phone ? `&oncall=${encodeURIComponent(data.on_call_phone)}` : ''));
}
