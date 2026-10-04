'use server';
// Requirements checklist and incident reports: saving.
import { revalidatePath } from 'next/cache';
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
    completedOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(new Date());
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
  const { error } = await supabase.from('incidents').insert({
    resident_id: residentId,
    home_id: text(formData, 'home_id'),
    occurred_on: text(formData, 'occurred_on'),
    occurred_time: text(formData, 'occurred_time'),
    incident_type: text(formData, 'incident_type'),
    is_critical: formData.get('is_critical') === 'on',
    is_urgent: formData.get('is_urgent') === 'on',
    description: text(formData, 'description'),
    actions_taken: text(formData, 'actions_taken'),
    family_notified: formData.get('family_notified') === 'on',
  });
  if (error) throw new Error('Could not save incident: ' + error.message);
  revalidatePath(`/residents/${residentId}`);
}

export async function updateIncident(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
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
  const { error } = await supabase.from('incidents').update(patch).eq('id', text(formData, 'id'));
  if (error) throw new Error('Could not update incident: ' + error.message);
  revalidatePath(`/residents/${residentId}`);
}
