// Record checks for a house: emergency information and the medication record (CLBC standards §3 and §11;
// MCFD guardian and medical information, D.6.6). Pure functions, so the same rules run everywhere.
import { todayISO } from '@/lib/options';

// Returns a list of plain-language issues for one resident. Empty list = all good.
export function residentIssues(r, meds = [], program) {
  const issues = [];
  if (!r.emergency_contact_name || !r.emergency_contact_phone) issues.push('Emergency contact name and phone are missing');
  if (!r.doctor_name) issues.push('Doctor is not recorded');
  if (r.allergies == null || String(r.allergies).trim() === '') issues.push('Allergies not recorded (write “none” if there are none)');
  if (r.care_plan_review_date && r.care_plan_review_date < todayISO()) issues.push('Care plan review is overdue');
  if (program === 'MCFD' && (!r.guardian_name || !r.guardian_phone)) issues.push('Guardian or parent name and phone are missing');

  if (r.on_medication && meds.length === 0) issues.push('Marked as on medication, but no medication is on the record');
  for (const m of meds) {
    const gaps = [];
    if (!m.dose) gaps.push('dose');
    if (!m.route) gaps.push('route');
    if (!m.prescriber) gaps.push('prescriber');
    if (gaps.length) issues.push(`${m.name}: ${gaps.join(', ')} missing from the medication record`);
  }
  return issues;
}
