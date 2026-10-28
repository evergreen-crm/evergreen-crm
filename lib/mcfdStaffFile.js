// MCFD staff file checks (standards G.1.9, G.1.10(a), G.3.7, G.4.3, G.4.5). Pure functions.
// Intervals for evaluations and supervision are Evergreen defaults, not MCFD figures: confirm with Melvin.
import { addMonthsISO } from '@/lib/onboarding';

export const EVALUATION_EVERY_MONTHS = 12; // Evergreen default: written performance evaluation every 12 months
export const SUPERVISION_EVERY_MONTHS = 3; // Evergreen default: supervision recorded every 3 months

// Returns plain-language gaps for one staff member's file. Empty list = complete.
// records: rows from staff_file_records for this person. details: staff_details row (or null).
export function staffFileGaps(records = [], details = null, today) {
  const gaps = [];
  const latest = (kind) => records.filter((r) => r.kind === kind).sort((a, b) => b.record_on.localeCompare(a.record_on))[0];

  const job = latest('job_description_acknowledged');
  if (!job) gaps.push('No signed job description on file (G.1.9, G.4.5(a))');

  const ev = latest('performance_evaluation');
  if (!ev) gaps.push('No written performance evaluation on file (G.1.10(a)(9), G.4.5(d))');
  else if (addMonthsISO(ev.record_on, EVALUATION_EVERY_MONTHS) < today) gaps.push(`Performance evaluation overdue (last ${ev.record_on}; every ${EVALUATION_EVERY_MONTHS} months)`);

  const sup = latest('supervision');
  if (!sup) gaps.push('No supervision recorded (G.4.3)');
  else if (addMonthsISO(sup.record_on, SUPERVISION_EVERY_MONTHS) < today) gaps.push(`Supervision overdue (last ${sup.record_on}; every ${SUPERVISION_EVERY_MONTHS} months)`);

  if (details && (details.last_day || (details.employment_status && details.employment_status !== 'Active'))) {
    if (!details.exit_interview_on) gaps.push('Exit interview not recorded (G.1.10(a)(13))');
    if (details.rehire_eligible == null) gaps.push('Rehire recommendation not recorded (G.1.10(a)(12))');
  }
  return gaps;
}
