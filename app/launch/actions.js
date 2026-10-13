'use server';
// Launch plans: plan details, milestone and task check-offs, pre-opening documents.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { todayISO } from '@/lib/options';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const num = (fd, k) => { const v = text(fd, k); return v === null || isNaN(Number(v)) ? null : Number(v); };
const back = (path, msg, bad) => redirect(`${path}${path.includes('?') ? '&' : '?'}${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);
const where = (fd) => `/launch/${text(fd, 'plan_id')}?tab=${text(fd, 'tab') ?? 'milestones'}`;

export async function updatePlan(fd) {
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const path = where(fd);
  if (levelOf(profile) < 4) back(path, 'Only a Director of Operations or above can change the plan details.', true);
  const patch = {
    care_setting_name: text(fd, 'care_setting_name'), care_setting_address: text(fd, 'care_setting_address'),
    cfr_number: text(fd, 'cfr_number'), contract_number: text(fd, 'contract_number'),
    contract_effective_date: text(fd, 'contract_effective_date'), opening_date: text(fd, 'opening_date'),
    submitted_by: text(fd, 'submitted_by'), submission_date: text(fd, 'submission_date'),
    transition_days: num(fd, 'transition_days'), max_staffing: num(fd, 'max_staffing'), max_facility: num(fd, 'max_facility'),
    max_supplemental: num(fd, 'max_supplemental'), payment_option: text(fd, 'payment_option'), status: text(fd, 'status') ?? 'Draft',
    goals: text(fd, 'goals'), assumptions: text(fd, 'assumptions'), risks: text(fd, 'risks'), risk_actions: text(fd, 'risk_actions'), other_notes: text(fd, 'other_notes'),
  };
  if (patch.transition_days && patch.transition_days > 90) back(path, 'The Transition-In period must be 90 days or less.', true);
  const { data, error } = await supabase.from('launch_plans').update(patch).eq('id', text(fd, 'plan_id')).select('id');
  if (error) back(path, error.message, true);
  if (!data?.length) back(path, 'Not saved — you don’t have permission to change this plan.', true);
  revalidatePath('/launch');
  back(path, 'Plan saved.');
}

export async function setTask(fd) {
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const path = where(fd);
  const done = fd.get('done') === '1';
  const { data, error } = await supabase.from('launch_tasks')
    .update({ completed_on: done ? (text(fd, 'date') ?? todayISO()) : null, owner_id: done ? profile.id : null })
    .eq('id', text(fd, 'id')).select('id');
  if (error) back(path, error.message, true);
  if (!data?.length) back(path, 'Not saved — Program Manager or above only.', true);
  revalidatePath(path.split('?')[0]);
  back(path, done ? 'Task marked done.' : 'Task reopened.');
}

export async function setMilestone(fd) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const path = where(fd);
  const done = fd.get('done') === '1';
  const { data, error } = await supabase.from('launch_milestones')
    .update({ completed_on: done ? (text(fd, 'date') ?? todayISO()) : null, notes: text(fd, 'notes') })
    .eq('id', text(fd, 'id')).select('id');
  if (error) back(path, error.message, true);
  if (!data?.length) back(path, 'Not saved — Program Manager or above only.', true);
  revalidatePath(path.split('?')[0]); revalidatePath('/launch');
  back(path, done ? 'Milestone complete — actual completion date recorded.' : 'Milestone reopened.');
}

export async function updateDocument(fd) {
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const path = where(fd);
  const status = text(fd, 'status') ?? 'Not started';
  const isDone = ['Approved', 'Submitted to MCFD', 'Not applicable'].includes(status);
  const patch = { status, file_link: text(fd, 'file_link'), completed_on: isDone ? todayISO() : null, approved_by: status === 'Approved' ? profile.id : null };
  const { data, error } = await supabase.from('launch_documents').update(patch).eq('id', text(fd, 'id')).select('id');
  if (error) back(path, error.message, true);
  if (!data?.length) back(path, 'Not saved — Program Manager or above only.', true);
  revalidatePath(path.split('?')[0]); revalidatePath('/launch');
  back(path, 'Document updated.');
}

// Called after a file is uploaded to storage for a pre-opening document.
export async function attachLaunchFile({ id, plan_id, path, name }) {
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const { data: old } = await supabase.from('launch_documents').select('file_path, status').eq('id', id).maybeSingle();
  if (!old) {
    await supabase.storage.from('launch-files').remove([path]);
    return { error: 'Document not found, or Program Manager or above only.' };
  }
  const patch = { file_path: path, file_name: name, uploaded_by: profile.id, uploaded_at: new Date().toISOString() };
  if (['Not started', 'Drafting'].includes(old.status)) patch.status = 'Ready for approval';
  const { data, error } = await supabase.from('launch_documents').update(patch).eq('id', id).select('id');
  if (error || !data?.length) {
    await supabase.storage.from('launch-files').remove([path]);
    return { error: error?.message ?? 'Not saved — Program Manager or above only.' };
  }
  if (old.file_path && old.file_path !== path) await supabase.storage.from('launch-files').remove([old.file_path]);
  revalidatePath(`/launch/${plan_id}`); revalidatePath('/launch');
  return { ok: true };
}

// House checklist (MCFD pre-opening): tick done, mark not applicable (with a reason), or re-open.
// The database enforces who may sign each item and keeps the CEO go/no-go locked until all MCFD and legal items are done.
export async function setChecklistItem(fd) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const path = where(fd);
  const op = text(fd, 'op');
  const note = text(fd, 'note');
  const patch = op === 'done' ? { done_on: text(fd, 'date') ?? todayISO(), not_applicable: false, note }
    : op === 'na' ? { done_on: null, not_applicable: true, note }
    : { done_on: null, not_applicable: false };
  const { data, error } = await supabase.from('launch_checklist').update(patch).eq('id', text(fd, 'id')).select('id');
  if (error) back(path, error.message, true);
  if (!data?.length) back(path, 'Not saved — Program Manager or above only.', true);
  revalidatePath(path.split('?')[0]); revalidatePath('/launch');
  back(path, op === 'done' ? 'Ticked off.' : op === 'na' ? 'Marked not applicable.' : 'Re-opened.');
}

// Called after an evidence file is uploaded for a checklist item.
export async function attachChecklistFile({ id, plan_id, path, name }) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const { data: old } = await supabase.from('launch_checklist').select('file_path').eq('id', id).maybeSingle();
  const { data, error } = await supabase.from('launch_checklist').update({ file_path: path, file_name: name }).eq('id', id).select('id');
  if (error || !data?.length) {
    await supabase.storage.from('launch-files').remove([path]);
    return { error: error?.message ?? 'Not saved — Program Manager or above only.' };
  }
  if (old?.file_path && old.file_path !== path) await supabase.storage.from('launch-files').remove([old.file_path]);
  revalidatePath(`/launch/${plan_id}`);
  return { ok: true };
}

// Start a new house: a fresh launch plan copied from an existing one (milestones, tasks, documents),
// plus the 87-item House checklist. Director of Operations+ only (checked again in the database).
export async function createLaunchPlan(fd) {
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  if (levelOf(profile) < 4) back('/launch', 'Only a Director of Operations or above can start a new house plan.', true);
  const { data: id, error } = await supabase.rpc('create_launch_plan', {
    p_service_type: text(fd, 'service_type'), p_name: text(fd, 'name'), p_address: text(fd, 'address'), p_copy_from: text(fd, 'copy_from'),
  });
  if (error) back('/launch', error.message, true);
  revalidatePath('/launch');
  back(`/launch/${id}?tab=checklist`, 'New house plan created with the full checklist, 12 milestones and the documents list. Enter the contract effective date in Plan details to set the due dates.');
}
