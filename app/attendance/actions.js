'use server';
// Attendance board: the Program Coordinator (own house) or a Program Manager confirms a possible no-show, or excuses it.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

export async function decideAbsence(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const status = fd.get('status') === 'No-show' ? 'No-show' : 'Excused';
  const note = String(fd.get('note') ?? '').trim().slice(0, 300) || null;
  const { error } = await supabase.rpc('decide_absence', { p_id: String(fd.get('id') ?? ''), p_status: status, p_note: note });
  revalidatePath('/attendance');
  redirect('/attendance?' + (error ? 'error=' + encodeURIComponent(error.message) : 'ok=' + encodeURIComponent(status === 'No-show' ? 'Recorded as a no-show. The staff member was told.' : 'Excused. The staff member was told.')));
}
