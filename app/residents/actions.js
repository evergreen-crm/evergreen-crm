'use server';
import { after } from 'next/server';
import { flushOutbox } from '@/lib/emailOutbox';
// Requirements checklist and incident reports: saving.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

export async function saveRequirement(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const residentId = text(formData, 'resident_id');
  const status = text(formData, 'status') ?? 'Not started';
  let completedOn = text(formData, 'completed_on');
  if (status === 'Complete' && !completedOn) {
    completedOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Etc/GMT+7' }).format(new Date());
  }
  const { error } = await supabase.from('resident_requirements').upsert({
    resident_id: residentId,
    req_key: text(formData, 'req_key'),
    status,
    completed_on: completedOn,
    notes: text(formData, 'notes'),
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('Could not save: ' + error.message);
  revalidatePath(`/residents/${residentId}`);
}

export async function addIncident(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const residentId = text(formData, 'resident_id');
  const physical = formData.get('physical_intervention') === 'on';
  const cls = physical ? 'Critical' : (text(formData, 'incident_class') ?? 'Critical');
  const { error } = await supabase.from('incidents').insert({
    resident_id: residentId,
    home_id: text(formData, 'home_id'),
    occurred_on: text(formData, 'occurred_on'),
    occurred_time: text(formData, 'occurred_time'),
    incident_type: text(formData, 'incident_type'),
    incident_class: cls,
    is_critical: cls === 'Critical',
    antecedent: text(formData, 'antecedent'),
    consequence: text(formData, 'consequence'),
    intervention: text(formData, 'intervention'),
    duration_minutes: text(formData, 'duration_minutes'),
    physical_intervention: physical,
    injuries: text(formData, 'injuries'),
    is_urgent: formData.get('is_urgent') === 'on',
    description: text(formData, 'description'),
    actions_taken: text(formData, 'actions_taken'),
    family_notified: formData.get('family_notified') === 'on',
    ...(physical || /^Restricted practice|^Physical intervention/.test(text(formData, 'incident_type') ?? '') ? {
      tried_first: text(formData, 'tried_first'),
      hold_used: text(formData, 'hold_used'),
      staff_involved: text(formData, 'staff_involved'),
      no_prohibited: formData.get('no_prohibited') === 'on',
      in_safety_plan: formData.get('in_safety_plan') === 'yes' ? true : formData.get('in_safety_plan') === 'no' ? false : null,
    } : {}),
  });
  if (error) throw new Error('Could not save incident: ' + error.message);
  if (cls === 'Critical') after(() => flushOutbox('urgent').catch(() => null)); // "📝 Incident form due by …" (supabase/incident-forms.sql)
  revalidatePath(`/residents/${residentId}`);
}

export async function updateIncident(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const residentId = text(formData, 'resident_id');
  const patch = {};
  const step = text(formData, 'step');
  if (step === 'verbal') {
    patch.verbal_report_to = text(formData, 'verbal_report_to');
    patch.verbal_report_at = new Date().toISOString();
  }
  if (step === 'written') patch.written_report_sent_on = text(formData, 'date');
  if (step === 'review') patch.internal_review_on = text(formData, 'date');
  if (step === 'family') patch.family_notified = true;
  if (step === 'close') patch.status = 'Closed';
  if (step === 'reopen') patch.status = 'Open';
  // ✋ After-restraint steps (supabase/restraint-log.sql)
  const now = new Date().toISOString();
  if (step === 'rst_first') { patch.tried_first = text(formData, 'tried_first'); patch.hold_used = text(formData, 'hold_used'); patch.no_prohibited = formData.get('no_prohibited') === 'on'; }
  if (step === 'rst_injury') { patch.injury_check_at = now; patch.injury_check_note = text(formData, 'note'); }
  if (step === 'rst_person') { patch.person_debrief_at = now; patch.person_view = text(formData, 'note'); }
  if (step === 'rst_staff') { patch.staff_debrief_at = now; patch.staff_view = text(formData, 'note'); }
  if (step === 'rst_funder') { patch.funder_told_at = now; patch.funder_told_who = text(formData, 'note'); }
  if (step === 'rst_review') { patch.manager_review_at = now; patch.manager_review_by = user.id; patch.manager_review = text(formData, 'note'); }
  const { error } = await supabase.from('incidents').update(patch).eq('id', text(formData, 'id'));
  revalidatePath(`/residents/${residentId}`);
  if (error) redirect(`/residents/${residentId}?tab=incidents&error=${encodeURIComponent(error.message.replace(/^.*?(Finish|Only)/, '$1'))}`);
  if (step?.startsWith('rst_')) redirect(`/residents/${residentId}?tab=incidents&ok=${encodeURIComponent('Saved.')}`);
}
