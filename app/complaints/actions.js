'use server';
// Complaints register (CLBC Complaint Resolution Policy ECC-RC-COMP-2026-001; MCFD SHSS B.2).
// Logging a complaint starts its duties automatically (log, acknowledge in 2 days, resolve in 10, formal review in 30).
// A complaint about a staff member goes to the level above them and is hidden from them. HR gets a copy.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const val = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const STEPS = ['Logged', 'Acknowledged', 'Informal resolution', 'Formal review', 'Resolved', 'Withdrawn'];
const back = (kind, msg, id) => redirect(`/complaints?${kind}=${encodeURIComponent(msg)}${id ? `#c-${id}` : ''}`);

export async function logComplaint(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const summary = val(formData, 'summary');
  if (!summary) back('error', 'Please write what the complaint is about.');
  const resident = val(formData, 'resident_id');
  let home = val(formData, 'home_id');
  if (resident && !home) {
    const { data } = await supabase.from('residents').select('home_id').eq('id', resident).maybeSingle();
    home = data?.home_id ?? null;
  }
  const about = val(formData, 'about_profile_id');
  const { error } = await supabase.from('complaints').insert({
    summary, channel: val(formData, 'channel'), from_who: val(formData, 'from_who'), resident_id: resident, home_id: home,
    about_profile_id: about === user.id ? null : about, received_by: user.id,
    told_can_go_to_funder: formData.get('told_can_go_to_funder') === 'on',
  });
  revalidatePath('/complaints');
  if (error) back('error', error.message);
  back('ok', 'Complaint logged. The follow-up tasks have been sent to the right level, and HR has a copy.');
}

export async function addComplaintStep(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const id = val(formData, 'id');
  const action = val(formData, 'action');
  if (!action) back('error', 'Write what was done.', id);
  const { error } = await supabase.from('complaint_steps').insert({ complaint_id: id, action, taken_on: val(formData, 'taken_on') ?? undefined, by_profile_id: user.id });
  revalidatePath('/complaints');
  if (error) back('error', error.message, id);
  back('ok', 'Step recorded.', id);
}

export async function updateComplaint(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = val(formData, 'id');
  const step = val(formData, 'step');
  if (!STEPS.includes(step)) back('error', 'Choose a step.', id);
  const satisfied = val(formData, 'satisfied');
  const { error } = await supabase.from('complaints').update({
    step, outcome: val(formData, 'outcome'), resolution_reason: val(formData, 'resolution_reason'),
    follow_up_on: val(formData, 'follow_up_on'),
    satisfied: satisfied === 'yes' ? true : satisfied === 'no' ? false : null,
    told_can_go_to_funder: formData.get('told_can_go_to_funder') === 'on',
  }).eq('id', id);
  revalidatePath('/complaints');
  if (error) back('error', error.message, id);
  back('ok', 'Complaint updated.', id);
}
