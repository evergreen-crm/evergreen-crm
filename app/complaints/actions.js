'use server';
// Complaints register (CLBC Complaint Resolution Policy ECC-RC-COMP-2026-001; MCFD SHSS B.2).
// Logging a complaint starts its duties automatically (log, acknowledge in 2 days, resolve in 10, formal review in 30).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const val = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const STEPS = ['Logged', 'Acknowledged', 'Informal resolution', 'Formal review', 'Resolved', 'Withdrawn'];

export async function logComplaint(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const summary = val(formData, 'summary');
  if (!summary) redirect('/complaints?error=' + encodeURIComponent('Please write what the complaint is about.'));
  const resident = val(formData, 'resident_id');
  let home = val(formData, 'home_id');
  if (resident && !home) {
    const { data } = await supabase.from('residents').select('home_id').eq('id', resident).maybeSingle();
    home = data?.home_id ?? null;
  }
  const { data, error } = await supabase.from('complaints').insert({
    summary, channel: val(formData, 'channel'), from_who: val(formData, 'from_who'), resident_id: resident, home_id: home,
    received_by: user.id, told_can_go_to_funder: formData.get('told_can_go_to_funder') === 'on',
  }).select('complaint_no').single();
  revalidatePath('/complaints');
  if (error) redirect('/complaints?error=' + encodeURIComponent(error.message));
  redirect('/complaints?ok=' + encodeURIComponent(`Complaint ${data.complaint_no} logged. The coordinator has been given the follow-up tasks.`));
}

export async function updateComplaint(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const step = val(formData, 'step');
  if (!STEPS.includes(step)) redirect('/complaints?error=' + encodeURIComponent('Choose a step.'));
  const satisfied = val(formData, 'satisfied');
  const { error } = await supabase.from('complaints').update({
    step, outcome: val(formData, 'outcome'), satisfied: satisfied === 'yes' ? true : satisfied === 'no' ? false : null,
    told_can_go_to_funder: formData.get('told_can_go_to_funder') === 'on',
  }).eq('id', val(formData, 'id'));
  revalidatePath('/complaints');
  if (error) redirect('/complaints?error=' + encodeURIComponent(error.message));
  redirect('/complaints?ok=' + encodeURIComponent('Complaint updated.'));
}
