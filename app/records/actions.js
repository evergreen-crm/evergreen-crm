'use server';
// Missing details: fill in blanks on a staff record, and run the check now.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const s = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null; };
const back = (msg, bad, anchor = '') => redirect(`/records?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}${anchor}`);
const FIELDS = ['hire_date', 'program', 'position', 'employment_type', 'emergency_contact', 'emergency_phone', 'phone'];

export async function fillBlanks(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = s(fd, 'profile_id');
  const p = {};
  for (const k of FIELDS) if (s(fd, k)) p[k] = s(fd, k);
  if (!Object.keys(p).length) back('Fill in at least one box, then press Save.', true, `#p-${id}`);
  const { error } = await supabase.rpc('fill_staff_blanks', { p_profile: id, p });
  if (error) back(error.message, true, `#p-${id}`);
  revalidatePath('/records'); revalidatePath('/hr'); revalidatePath(`/hr/${id}`); revalidatePath('/todo');
  back('Saved. Anything still missing for this person is shown below.', false, `#p-${id}`);
}

export async function checkNow() {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('scan_record_gaps', { p_trigger: 'now' });
  if (error) back(error.message, true);
  revalidatePath('/records'); revalidatePath('/todo');
  back(`Checked: ${data?.found ?? 0} newly missing, ${data?.fixed ?? 0} fixed, ${data?.escalated ?? 0} moved up a level. ${data?.open ?? 0} still missing.`);
}
