// What is different between an MCFD house and a CLBC house. Built from the rules already in the CRM
// (lib/incidents.js, lib/requirements.js, lib/intakeForms.js), so the house form always shows the current rules.
import { MCFD, CLBC } from '@/lib/requirements';
import { INTAKE_FORMS } from '@/lib/intakeForms';

const itemCount = (p) => (p.sections ?? []).reduce((n, s) => n + (s.items?.length ?? 0), 0);
const sectionTitles = (p) => (p.sections ?? []).map((s) => s.title);
const formsFor = (stream) => INTAKE_FORMS.filter((f) => f.stream === 'Both' || f.stream === stream).length;

export const PROGRAM_DIFFERENCES = [
  { topic: 'Who the house serves', mcfd: 'Children and youth in care (MCFD)', clbc: 'Adults with a developmental disability (CLBC)' },
  { topic: 'Critical incident report form', mcfd: 'MCFD Reportable Incident Form (CF4179)', clbc: 'CLBC Critical Incident Report' },
  { topic: 'Written report deadline', mcfd: 'Within 24 hours of every reportable incident', clbc: '24 hours if urgent; otherwise within 5 working days' },
  { topic: 'Who is told first', mcfd: 'The youth’s social worker, right away', clbc: 'The CLBC liaison analyst, by phone, right away' },
  { topic: 'Internal review of an incident', mcfd: 'Within 5 business days (MCFD Policy 6.3)', clbc: 'Not set in the CRM yet. Check the CLBC guide' },
  { topic: 'Emergency line', mcfd: 'Provincial Centralized Screening 1-800-663-9122 (24 hours)', clbc: 'The CLBC liaison analyst or the CLBC regional office' },
  { topic: 'Resident file checklist', mcfd: `${itemCount(MCFD)} items in ${sectionTitles(MCFD).length} sections`, clbc: `${itemCount(CLBC)} items in ${sectionTitles(CLBC).length} sections` },
  { topic: 'Intake forms to send', mcfd: `${formsFor('MCFD')} forms (MCFD referral and placement)`, clbc: `${formsFor('CLBC')} forms (CLBC referral and planning)` },
  { topic: 'Care plan', mcfd: 'MCFD Care Plan, reviewed with the social worker', clbc: 'Individual Support Plan (ISP), reviewed with the facilitator' },
  { topic: 'Restraint', mcfd: 'Governed by MCFD policy (3.6 is still being written)', clbc: 'Restricted practices plan with CLBC approval' },
];

export const documentsFor = (program) => (program === 'CLBC' ? CLBC : MCFD);
