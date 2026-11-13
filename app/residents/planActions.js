'use server';
// Phase 3 plan: save the plan, record a review, sign-off, and the plan log (check-ins, visits, natural supports, rights reviews).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { LOG_KINDS } from '@/lib/plans';

const val = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const back = (rid, kind, msg) => redirect(`/residents/${rid}?tab=plan&${kind}=${encodeURIComponent(msg)}`);
const DATE_FIELDS = ['started_on', 'last_review_on', 'next_review_on', 'facilitator_review_on', 'iep_due_on', 'medical_due_on',
  'dental_due_on', 'eye_due_on', 'rights_review_due_on', 'person_agreed_on', 'rep_signed_on', 'sw_signed_on'];
const TEXT_FIELDS = ['what_matters', 'strengths', 'how_to_support', 'person_agreed_how', 'rep_name', 'sw_name', 'sw_email'];
const BOOL_FIELDS = ['supported_decision_making', 'representation_agreement', 'guardian_consent'];

export async function savePlan(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const rid = val(fd, 'resident_id');
  const row = {};
  // only the fields present on the submitted form are changed
  for (const f of [...DATE_FIELDS, ...TEXT_FIELDS]) if (fd.has(f)) row[f] = val(fd, f);
  if (fd.get('booleans') === '1') for (const f of BOOL_FIELDS) row[f] = fd.get(f) === 'on';
  if (row.sw_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.sw_email)) back(rid, 'error', 'Check the social worker’s email address.');
  const { data: existing } = await supabase.from('care_plans').select('id').eq('resident_id', rid).maybeSingle();
  const { error } = existing
    ? await supabase.from('care_plans').update(row).eq('id', existing.id)
    : await supabase.from('care_plans').insert({ ...row, resident_id: rid, stream: val(fd, 'stream') });
  revalidatePath(`/residents/${rid}`);
  if (error) back(rid, 'error', error.message);
  back(rid, 'ok', existing ? 'Plan saved. Reminders follow the new dates.' : 'Plan started. Reminders will come before each review and due date.');
}

export async function addPlanLog(fd) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const rid = val(fd, 'resident_id');
  const kind = val(fd, 'kind');
  if (!LOG_KINDS[kind]) back(rid, 'error', 'Choose what you are recording.');
  const hours = val(fd, 'hours');
  const { error } = await supabase.from('plan_log').insert({
    resident_id: rid, kind, on_date: val(fd, 'on_date') ?? undefined, hours: hours ? Number(hours) : null,
    with_whom: val(fd, 'with_whom'), note: val(fd, 'note'), by_profile_id: user.id,
  });
  revalidatePath(`/residents/${rid}`);
  if (error) back(rid, 'error', error.message);
  back(rid, 'ok', 'Recorded.');
}
