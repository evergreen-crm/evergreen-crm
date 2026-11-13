// Phase 3: plans for adults (CLBC person-centred plan) and children/youth (MCFD plan of care).
// The database creates the reminder tasks from the plan's dates (duty_run_plans, supabase 007).

// CLBC's eight quality-of-life areas
export const CLBC_AREAS = ['Emotional well-being', 'Interpersonal relations', 'Material well-being', 'Personal development',
  'Physical well-being', 'Self-determination', 'Social inclusion', 'Rights'];
// MCFD plan of care domains
export const MCFD_DOMAINS = ['Health', 'Education', 'Family & culture', 'Identity', 'Life skills'];

export const areasFor = (stream) => (stream === 'MCFD' ? MCFD_DOMAINS : CLBC_AREAS);

// Which program a person's plan follows (same rule as the database's plan_stream)
export function streamOf(resident) {
  const p = resident?.program || resident?.homes?.program;
  if (p === 'MCFD' || p === 'CLBC') return p;
  return ['Child', 'Youth'].includes(resident?.care_type) ? 'MCFD' : 'CLBC';
}

export const PLAN_NAME = { CLBC: 'Person-centred plan', MCFD: 'Plan of care' };

// MCFD due-date board
export const MCFD_DUE = [
  ['next_review_on', 'Plan of care review'],
  ['iep_due_on', 'School IEP'],
  ['medical_due_on', 'Medical check-up'],
  ['dental_due_on', 'Dental check-up'],
  ['eye_due_on', 'Eye exam'],
  ['rights_review_due_on', 'Rights review (CFCSA s.70)'],
];
export const CLBC_DUE = [
  ['next_review_on', 'Six-month plan review'],
  ['facilitator_review_on', 'Yearly review with the CLBC facilitator'],
];

export const LOG_KINDS = {
  checkin: { label: 'Monthly check-in with the person', stream: 'CLBC', hours: false },
  natural_support: { label: 'Time with natural supports (no paid staff)', stream: 'CLBC', hours: true },
  family_visit: { label: 'Family visit or contact', stream: 'MCFD', hours: true },
  cultural_connection: { label: 'Cultural connection (community, Nation, events)', stream: 'BOTH', hours: true },
  rights_review: { label: 'Rights reviewed with the youth (CFCSA s.70, how to contact the RCY)', stream: 'MCFD', hours: false },
};
export const logKindsFor = (stream) => Object.entries(LOG_KINDS).filter(([, k]) => k.stream === 'BOTH' || k.stream === stream);

export const AGREED_HOW = ['Picture-supported plan', 'Plain-language plan, read together', 'Signed', 'Spoken agreement (witnessed)', 'Other'];

// Support level recorded with goal progress, from most to least support
export const SUPPORT_LEVELS = ['With full support', 'With prompts', 'Independent', 'Refused / not attempted'];

export function dueState(date, today, soonDays = 30) {
  if (!date) return { cls: 'warn', text: 'No date set' };
  if (date < today) return { cls: 'bad', text: 'Overdue' };
  const soon = new Date(today); soon.setDate(soon.getDate() + soonDays);
  if (date <= soon.toISOString().slice(0, 10)) return { cls: 'warn', text: 'Due soon' };
  return { cls: '', text: 'On track' };
}
