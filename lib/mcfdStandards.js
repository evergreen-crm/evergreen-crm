// MCFD Standards for Staffed Children's Residential Services: the records staff keep for each child.
// One list, used by the house shift log (daily entry) and the documentation guide, so they never disagree.
// Standard numbers are as read from the official PDF (gov.bc.ca, standards_residential_services.pdf).

// Each daily record: the entry kind (lib/entries.js), the standard section, and when it is entered.
export const MCFD_RECORDS = [
  { kind: 'day_book', section: 'Daily record (day book)', standard: 'C.1.11, E.7.10', when: 'Every day, for every child: routines, significant events, any change to routines' },
  { kind: 'wellness_check', section: 'Daily safety and wellness check', standard: 'C.1.12', when: 'Every day, for every child, within the plan of care' },
  { kind: 'mcfd_incident', section: 'Reportable incident (notify and record)', standard: 'C.2.8, E.7.10', when: 'Notify the social worker immediately; record in the same shift' },
  { kind: 'mcfd_restraint', section: 'Physical restraint or seclusion', standard: 'C.3.9, C.3.11, C.3.13(b)', when: 'Each time; child and staff views recorded; debrief with the child' },
  { kind: 'mcfd_discipline', section: 'Behaviour of concern and discipline', standard: 'D.7.5, D.7.8(a)', when: 'Each event: what led to it, and the discipline used under policy' },
  { kind: 'mcfd_illness', section: 'Serious illness or injury', standard: 'D.6.5(b)', when: 'As soon as possible: notify the social worker and others of significance' },
  { kind: 'mcfd_views', section: 'Views of the child, family and others', standard: 'E.3.9, E.3.10(e)', when: 'Each time views are sought, recorded in the individual service record' },
  { kind: 'mcfd_record_note', section: 'Individual service record (by section)', standard: 'E.7.10, E.7.11, D.6.6(f)', when: 'Whenever a required record changes: intake, legal, health, consents, assessments, plan, reviews, incidents, transition' },
  { kind: 'mcfd_care_review', section: 'Care plan and goal review', standard: 'E.4.5, E.5.6, E.5.10(c), E.5.13', when: 'On each review date: progress against measurable objectives, child’s input, next review date' },
  { kind: 'mar', section: 'Medication (MAR)', standard: 'D.6.6(c), D.6.6(f)', when: 'Each dose given or refused, on the Medications tab', tab: 'mar' },
];

// Sections of the individual service record (standard E.7.10). Used as the list for “Individual service record (by section)”.
export const SERVICE_RECORD_SECTIONS = [
  'Intake documentation (information, required documents, consents)',
  'Indigenous identity (where the child is Indigenous)',
  'Legal documents (court orders, legal status, guardianship)',
  'Health: medical and dental information, immunization, signed consents',
  'Assessment information',
  'Care plan responsibilities and reviews',
  'Daily record (day book)',
  'Incident documentation',
  'Complaints',
  'Service termination or transition plan',
  'Other personal information or documents',
];

// Standard E.7.10 record categories, as rows for the documentation guide.
export const SERVICE_RECORD_STANDARD = [
  ['Intake documentation', 'Intake information, required documentation, and consents'],
  ['Indigenous identity', 'Identity documented for Indigenous children and youth'],
  ['Legal documents', 'Court orders, legal status documentation, guardianship information'],
  ['Health information', 'Medical and dental information, immunization records, signed consent'],
  ['Assessment information', 'Assessment records relevant to service delivery'],
  ['Care plan', 'Current care plan responsibilities and reviews'],
  ['Daily record', 'Day book for each child, normal routines and changes'],
  ['Incident documentation', 'Documentation of reportable incidents involving the child'],
  ['Complaints', 'Complaints made by or about the child'],
  ['Service termination', 'Documentation of service termination or transition plan'],
  ['Other', 'Any other personal information or documents about the child'],
];

export const mcfdRecord = (kind) => MCFD_RECORDS.find((r) => r.kind === kind);
