// Requirement checklists for each resident.
// MCFD items come from Evergreen's MCFD Residential Care Policy Manual
// (ECC-RC-POL-2024-001). CLBC items follow CLBC's Critical Incidents policy
// (Nov 2024) and standard CLBC service expectations; items marked
// "Evergreen standard" are our own practice and can be adjusted.
//
// days     = due this many days after admission (0 = at/before admission)
// every    = repeats this many days after the last completion
// when     = only applies if the resident has this flag (e.g. 'is_indigenous')

export const MCFD = {
  key: 'mcfd',
  label: 'MCFD (children & youth)',
  sections: [
    {
      title: 'Intake documents (at admission) — Policy 3.2',
      items: [
        { key: 'mcfd_placement_agreement', label: 'Signed placement agreement or care order from MCFD', days: 0 },
        { key: 'mcfd_care_plan_received', label: 'Current MCFD Care Plan and goals on file', days: 0 },
        { key: 'mcfd_medical_info', label: 'Medical information, immunization records, health history', days: 0 },
        { key: 'mcfd_emergency_contacts', label: 'Emergency contact information', days: 0 },
        { key: 'mcfd_consents', label: 'Consent forms: medical treatment, photographs, community activities', days: 0 },
        { key: 'mcfd_cultural_background', label: 'Cultural and spiritual background information', days: 0 },
        { key: 'mcfd_school_records', label: 'School records and IEP (if applicable)', days: 0 },
        { key: 'mcfd_court_orders', label: 'Court, supervision or restraining orders on file (or confirmed none)', days: 0 },
        { key: 'mcfd_risk_assessment', label: 'Risk and safety assessment', days: 0 },
        { key: 'mcfd_rights_explained', label: 'Rights of children in care explained to the child (Policy 7.1)', days: 0 },
      ],
    },
    {
      title: 'Indigenous children — Policy 3.3 & 8.3',
      items: [
        { key: 'mcfd_nation_notified', label: "Child's Indigenous community / Nation notified", days: 0, when: 'is_indigenous' },
        { key: 'mcfd_cultural_plan', label: 'Cultural Plan developed with child, family and Nation', days: 30, when: 'is_indigenous' },
      ],
    },
    {
      title: 'Care planning — Policy 4',
      items: [
        { key: 'mcfd_icp', label: 'Individual Care Plan (ICP) developed with MCFD social worker', days: 30 },
        { key: 'mcfd_icp_review', label: 'Care Plan review (at least every 6 months)', days: 182, every: 182 },
        { key: 'mcfd_bsp_review', label: 'Behaviour Support Plan review (at least quarterly)', days: 91, every: 91, when: 'has_bsp' },
      ],
    },
    {
      title: 'Health — Policy 6.1 & 6.2',
      items: [
        { key: 'mcfd_physician', label: 'Registered with a family physician or nurse practitioner', days: 30 },
        { key: 'mcfd_dental', label: 'Dental assessment (if not current)', days: 60 },
        { key: 'mcfd_vision', label: 'Vision assessment (if not current)', days: 60 },
        { key: 'mcfd_mar', label: 'Medication Administration Record (MAR) set up', days: 0, when: 'on_medication' },
      ],
    },
  ],
};

export const CLBC = {
  key: 'clbc',
  label: 'CLBC (adults)',
  sections: [
    {
      title: 'Intake (at admission)',
      items: [
        { key: 'clbc_referral', label: 'CLBC referral / service request and contract details on file', days: 0 },
        { key: 'clbc_emergency_info', label: 'Emergency information sheet and contacts', days: 0 },
        { key: 'clbc_decision_support', label: 'Guardian, Representation Agreement or decision supports documented', days: 0 },
        { key: 'clbc_consents', label: 'Consents: health information sharing, photos, activities', days: 0 },
        { key: 'clbc_rights_explained', label: 'Rights, privacy and complaints process explained', days: 0 },
        { key: 'clbc_belongings', label: 'Personal belongings and finances inventory (Evergreen standard)', days: 7 },
      ],
    },
    {
      title: 'Planning (person-centred)',
      items: [
        { key: 'clbc_isp', label: 'Individual Support Plan — person-centred, with the person and their supporters (Evergreen standard: 30 days)', days: 30 },
        { key: 'clbc_isp_review', label: 'Individual Support Plan review (Evergreen standard: yearly)', days: 365, every: 365 },
        { key: 'clbc_safety_plan', label: 'Behaviour support & safety plan in place', days: 30, when: 'has_bsp' },
        { key: 'clbc_restricted_review', label: 'Restricted practices reviewed — any use is a reportable critical incident', days: 91, every: 91, when: 'has_bsp' },
      ],
    },
    {
      title: 'Health',
      items: [
        { key: 'clbc_health_plan', label: 'Health care plan / health profile', days: 30 },
        { key: 'clbc_physical', label: 'Annual medical check-up', days: 365, every: 365 },
        { key: 'clbc_dental', label: 'Annual dental check-up', days: 365, every: 365 },
        { key: 'clbc_mar', label: 'Medication Administration Record (MAR) set up', days: 0, when: 'on_medication' },
      ],
    },
    {
      title: 'Incidents & quality',
      items: [
        { key: 'clbc_incident_trends', label: 'Yearly review of incident trends (CLBC Critical Incidents requirement)', days: 365, every: 365 },
      ],
    },
  ],
};

// Which checklists apply to this resident.
export function programsFor(resident) {
  const f = (resident.funder ?? '').toUpperCase();
  const out = [];
  if (f.includes('MCFD') || (!f.includes('CLBC') && ['Child', 'Youth'].includes(resident.care_type))) out.push(MCFD);
  if (f.includes('CLBC') || (!f.includes('MCFD') && (resident.care_type ?? 'Adult') === 'Adult')) out.push(CLBC);
  return out;
}

const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Work out due date and status for one item.
export function itemState(item, record, resident, today) {
  if (item.when && !resident[item.when]) return { applies: false };
  const status = record?.status ?? 'Not started';
  let due = null;
  if (item.every && record?.completed_on) due = addDays(record.completed_on, item.every);
  else if (resident.admission_date) due = addDays(resident.admission_date, item.days);

  const recurringDone = item.every && record?.completed_on && due > today;
  const done = (status === 'Complete' && (!item.every || recurringDone)) || status === 'N/A';
  let flag = 'ok';
  if (!done && due && due < today) flag = 'overdue';
  else if (!done && due && (new Date(due) - new Date(today)) / 86400000 <= 14) flag = 'soon';
  if (item.every && record?.completed_on && due <= today) flag = 'overdue';
  return { applies: true, status, due, done, flag };
}

// Incident types (MCFD Policy 6.3 + CLBC Critical Incidents policy)
export const INCIDENT_TYPES = [
  'Serious injury or illness',
  'Death',
  'Abuse or neglect (allegation)',
  'Unauthorized absence / missing',
  'Physical intervention or restraint',
  'Restricted practice (rights restriction, seclusion)',
  'Police contact',
  'Arrest or criminal charges',
  'Aggression between individuals',
  'Attempted suicide',
  'Choking',
  'Fall',
  'Poisoning',
  'Misuse of drugs or alcohol',
  'Weapon use',
  'Medication error',
  'Property damage',
  'Other significant event',
];

// Staff training required by Evergreen's MCFD policy (5.1 & 5.3)
export const REQUIRED_TRAINING = [
  { title: 'WHMIS & Workplace Safety Orientation', days: 0 },
  { title: 'MCFD orientation', days: 0 },
  { title: 'MCFD Introduction to Child Protection', days: 30 },
  { title: 'Mandatory Reporter training (CFCSA)', days: 30 },
  { title: 'Trauma-Informed Practice', days: 60 },
  { title: 'Indigenous Cultural Safety and Humility', days: 60 },
  { title: 'Non-Violent Crisis Intervention (NVCI)', days: 90 },
];
