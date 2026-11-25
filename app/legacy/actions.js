'use server';
// Legacy agreement transition-in plans: create a plan, change plan details, tick off obligations.
// Permissions are checked again in the database (supabase/legacy-transition.sql).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const back = (path, msg, bad) => redirect(`${path}${path.includes('?') ? '&' : '?'}${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);

const STATUSES = ['Draft', 'Submitted to Director', 'Approved', 'Signed', 'Term complete'];
const SERVICE_TYPES = ['Emergency Care', 'Low-Barrier Short-Term Stabilization Care', 'Respite Care', 'Specialized Long-Term Care'];

// Term ends the day before the first anniversary of the Effective Date (12-month initial term).
function termEnd(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function createLegacyPlan(fd) {
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  if (levelOf(profile) < 4) back('/legacy', 'Only a Director of Operations or above can start a legacy transition plan.', true);
  const service = text(fd, 'shss_service_type');
  if (service && !SERVICE_TYPES.includes(service)) back('/legacy', 'Choose a service type from the list.', true);
  const { data: id, error } = await supabase.rpc('create_legacy_plan', {
    p_name: text(fd, 'care_setting_name'), p_address: text(fd, 'care_setting_address'), p_service_type: service,
    p_agreement_number: text(fd, 'agreement_number'), p_effective_date: text(fd, 'effective_date'),
  });
  if (error) back('/legacy', error.message, true);
  revalidatePath('/legacy');
  back(`/legacy/${id}`, 'Plan created with the 25 standard obligations. Check the Plan details and the dates.');
}

export async function updateLegacyPlan(fd) {
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const id = text(fd, 'plan_id');
  const path = `/legacy/${id}`;
  if (levelOf(profile) < 4) back(path, 'Only a Director of Operations or above can change the plan details.', true);
  const status = text(fd, 'status') ?? 'Draft';
  if (!STATUSES.includes(status)) back(path, 'Choose a status from the list.', true);
  const effective = text(fd, 'effective_date');
  const patch = {
    service_provider_name: text(fd, 'service_provider_name'), care_setting_name: text(fd, 'care_setting_name'),
    care_setting_address: text(fd, 'care_setting_address'), shss_service_type: text(fd, 'shss_service_type'),
    agreement_number: text(fd, 'agreement_number'), effective_date: effective, term_end_date: termEnd(effective),
    plan_submitted_on: text(fd, 'plan_submitted_on'), submitted_by: text(fd, 'submitted_by'), first_draft_on: text(fd, 'first_draft_on'),
    thirty_day_review_on: text(fd, 'thirty_day_review_on'), plan_approved_on: text(fd, 'plan_approved_on'),
    initial_90_update_due: text(fd, 'initial_90_update_due'), source_documents: text(fd, 'source_documents'),
    notes: text(fd, 'notes'), status,
  };
  const { data, error } = await supabase.from('legacy_plans').update(patch).eq('id', id).select('id');
  if (error) back(path, error.message, true);
  if (!data?.length) back(path, 'Not saved — you don’t have permission to change this plan.', true);
  revalidatePath('/legacy'); revalidatePath(path);
  back(path, 'Plan details saved.');
}

// One obligation: status, date achieved, action plan (required while In Progress), Director feedback.
export async function updateLegacyObligation(fd) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const id = text(fd, 'id');
  const planId = text(fd, 'plan_id');
  const path = `/legacy/${planId}`;
  const status = text(fd, 'status') ?? 'In Progress';
  const action = text(fd, 'action_plan');
  if (!['Achieved', 'In Progress'].includes(status)) back(path, 'Choose Achieved or In Progress.', true);
  if (status === 'In Progress' && !action) back(path, 'Describe the action plan for an item that is still In Progress.', true);
  const patch = {
    status, action_plan: action, director_feedback: text(fd, 'director_feedback'),
    achieved_on: status === 'Achieved' ? (text(fd, 'achieved_on') ?? new Date().toISOString().slice(0, 10)) : null,
  };
  const { data, error } = await supabase.from('legacy_obligations').update(patch).eq('id', id).select('id');
  if (error) back(path, error.message, true);
  if (!data?.length) back(path, 'Not saved — you don’t have permission to change this item.', true);
  revalidatePath(path); revalidatePath('/legacy');
  back(path, status === 'Achieved' ? 'Marked achieved.' : 'Saved.');
}
