// 🏅 Quality assurance portal (directors and up): rules and the COA standard groups.
// Evergreen follows COA (Council on Accreditation) standards mainly; CARF is shown as a secondary note.
// Every number comes from the same KPI engine (lib/kpis.js), so the QA portal, the KPI page and the
// house dashboards never disagree.
import { levelOf } from '@/lib/levels';

// Director of Operations (4), Executive Director (5), CSO (6), CEO (7), Admin (8).
export const QA_MIN_LEVEL = 4;
export const canSeeQa = (profile) => levelOf(profile) >= QA_MIN_LEVEL;

// COA standard areas used in Phase 1, each with the KPIs that give evidence for it.
// Codes are COA's own section codes (Administration & Management, Service Delivery Administration, Service).
export const COA_AREAS = [
  { code: 'PQI', title: 'Performance and Quality Improvement', icon: '📈', carf: 'CARF: Performance measurement & management',
    what: 'Measure, review and improve: corrective actions get done on time.',
    kpis: ['corrective_actions', 'cap_on_time', 'outstanding_docs'] },
  { code: 'RPM', title: 'Risk Prevention and Management', icon: '⚠️', carf: 'CARF: Risk management',
    what: 'Incidents reported to the funder on time, reviewed, and trends watched.',
    kpis: ['open_incidents', 'critical_incidents', 'critical_on_time', 'incident_reviews', 'reports_due'] },
  { code: 'BSM', title: 'Behavior Support and Management', icon: '✋', carf: 'CARF: Rights / restrictive interventions',
    what: 'Restraint only as a last resort; every one reviewed.',
    kpis: ['restraints'] },
  { code: 'GLS', title: 'Group Living Services', icon: '🏡', carf: 'CARF: Child & Youth / Community services',
    what: 'Care plans current, medications documented, appointments kept, required documents on file.',
    kpis: ['care_plans', 'mar_complete', 'med_errors', 'appts_done', 'contract_reqs'] },
  { code: 'HR', title: 'Human Resources', icon: '🪪', carf: 'CARF: Workforce development & management',
    what: 'Criminal record checks and credentials current; enough staff on every shift.',
    kpis: ['crc', 'credentials', 'shift_coverage', 'overtime_week', 'onboarding'] },
  { code: 'TS', title: 'Training and Supervision', icon: '🎓', carf: 'CARF: Workforce development',
    what: 'Mandatory training current; policies read and signed.',
    kpis: ['training', 'policy_signoff'] },
  { code: 'ASE', title: 'Administrative and Service Environment', icon: '🔥', carf: 'CARF: Health & safety',
    what: 'Fire drills, safety checks and monthly inspections done in every house.',
    kpis: ['fire_drills', 'safety_checks'] },
  { code: 'CR', title: 'Client Rights', icon: '🗣', carf: 'CARF: Rights of persons served',
    what: 'Complaints acknowledged and resolved on time.',
    kpis: ['complaints'] },
];

export const QA_PAGES = [
  { href: '/qa', label: 'Dashboard', icon: '🏅' },
  { href: '/qa/records', label: 'Enter records', icon: '📝' },
  { href: '/qa/incidents', label: 'Incidents & risk', icon: '⚠️' },
  { href: '/qa/staff', label: 'Staff compliance', icon: '🪪' },
  { href: '/qa/safety', label: 'Health & safety', icon: '🔥' },
  { href: '/qa/actions', label: 'Improvement actions', icon: '🛠' },
  { href: '/qa/surveys', label: 'Surveys & reviews', icon: '📋' },
  { href: '/qa/audits', label: 'File audits', icon: '🗂' },
  { href: '/qa/standards', label: 'COA standards', icon: '📚' },
  { href: '/qa/report', label: 'Quarterly report', icon: '📄' },
];

// Score an area: share of its measured KPIs that are green (yellow counts half).
export function areaScore(kpis) {
  const measured = kpis.filter((k) => k && k.status !== 'none');
  if (!measured.length) return null;
  const pts = measured.reduce((s, k) => s + (k.status === 'green' ? 1 : k.status === 'yellow' ? 0.5 : 0), 0);
  return Math.round((100 * pts) / measured.length);
}
export const scoreColor = (v) => (v === null ? 'none' : v >= 90 ? 'green' : v >= 70 ? 'yellow' : 'red');

// The last n months as YYYY-MM, oldest first.
export function lastMonths(todayIso, n = 12) {
  const y = Number(todayIso.slice(0, 4)), m = Number(todayIso.slice(5, 7));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
export const monthLabel = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleString('en-CA', { month: 'short', year: '2-digit', timeZone: 'UTC' });

// Every QA page view is written to the access log (supabase/qa-portal.sql). Never blocks the page.
export async function logQaView(supabase, page) {
  try { await supabase.from('qa_view_log').insert({ page }); } catch {}
}

// Resident file audit (MCFD Tool D · COA GLS / CR). Each item is Yes / No / N/A; score = % of applicable items met.
export const FILE_AUDIT = [
  { group: 'Plan of care', items: [
    { id: 'isp', text: 'Care plan / ISP is current (reviewed within its due date) and signed.' },
    { id: 'goals', text: 'Goals are specific and progress is recorded at least monthly.' },
    { id: 'voice', text: 'The youth’s own words and wishes are recorded in the plan.' },
    { id: 'family', text: 'Family / guardian involvement is documented.' },
  ] },
  { group: 'Culture and identity', items: [
    { id: 'cultural', text: 'Cultural plan (or Indigenous connection plan) is in place and followed.' },
  ] },
  { group: 'Safety', items: [
    { id: 'safety_plan', text: 'Safety plan / risk assessment is current.' },
    { id: 'missing_plan', text: 'Missing-person profile with a recent photo is on file.' },
    { id: 'bsp', text: 'Behaviour support plan is current where restraints or high-risk behaviours occur.' },
  ] },
  { group: 'Health', items: [
    { id: 'meds', text: 'Medication orders match the MAR; MAR has no gaps for the last 30 days.' },
    { id: 'health', text: 'Medical, dental and vision appointments are up to date.' },
  ] },
  { group: 'Records and rights', items: [
    { id: 'consents', text: 'Consents, legal status and placement agreement are on file and current.' },
    { id: 'rights', text: 'Rights and complaints information was explained and signed.' },
    { id: 'logs', text: 'Daily logs are complete, objective and written every shift.' },
    { id: 'incidents', text: 'Incidents were reported to the funder on time and reviewed.' },
  ] },
];
export const FILE_AUDIT_ITEMS = FILE_AUDIT.flatMap((g) => g.items);
export function auditScore(answers) {
  const applicable = FILE_AUDIT_ITEMS.filter((i) => answers?.[i.id] === 'yes' || answers?.[i.id] === 'no');
  if (!applicable.length) return null;
  return Math.round((100 * applicable.filter((i) => answers[i.id] === 'yes').length) / applicable.length);
}

// ---------------------------------------------------------------------------------------------
// 📝 QA records you enter and save (COA evidence that the CRM doesn't already collect elsewhere).
// Saved in the shared `records` table under division 'coa', which only level 4+ can open
// (division_levels row added by supabase/qa-records.sql). Field types match the portal forms:
// text, textarea, number, select, date, yesno.
// ---------------------------------------------------------------------------------------------
const T = (name, label, extra = {}) => ({ name, label, type: 'text', ...extra });
const TA = (name, label, extra = {}) => ({ name, label, type: 'textarea', ...extra });
const S = (name, label, options, extra = {}) => ({ name, label, type: 'select', options, ...extra });
const D = (name, label, extra = {}) => ({ name, label, type: 'date', ...extra });
const N = (name, label, extra = {}) => ({ name, label, type: 'number', ...extra });
const YN = (name, label) => ({ name, label, type: 'yesno' });

export const QA_DIVISION = 'coa';
export const QA_RECORD_STATUSES = ['Open', 'In progress', 'Complete', 'N/A'];
export const LIKELIHOOD = ['1 - Rare', '2 - Unlikely', '3 - Possible', '4 - Likely', '5 - Almost certain'];
export const IMPACT = ['1 - Minor', '2 - Moderate', '3 - Serious', '4 - Major', '5 - Severe'];

export const QA_RECORD_TYPES = [
  {
    key: 'committee', icon: '👥', title: 'QA committee meetings', coa: 'PQI',
    summary: 'Each time leadership meets to review quality data: who came, what was reviewed, what was decided, and who follows up.',
    rules: ['QA committee meets at least every quarter', 'Minutes kept and shared with staff', 'Every follow-up has an owner and a date'],
    types: ['Quarterly QA committee', 'Monthly leadership QA review', 'Special / urgent review'],
    titleHint: 'e.g. Q3 2026 QA committee',
    fields: [TA('attendees', 'Who attended', { required: true }), TA('reviewed', 'Data and reports reviewed'), TA('findings', 'What we found'), TA('decisions', 'Decisions'), TA('follow_up', 'Follow-up (who does what, by when)')],
  },
  {
    key: 'risks', icon: '⚠️', title: 'Risk register', coa: 'RPM',
    summary: 'Every risk to the people we serve, staff, money, privacy or the program — how likely, how bad, and what we are doing about it.',
    rules: ['Whole register reviewed at least every year (each high risk every 3 months)', 'Every risk has an owner', 'Score = likelihood × impact: 1–4 low, 5–9 medium, 10–16 high, 20–25 extreme'],
    types: ['Client safety', 'Staff safety', 'Legal / regulatory', 'Financial', 'Privacy / information', 'Property / facility', 'Reputation', 'Service continuity'],
    titleHint: 'e.g. Youth goes missing at night',
    dueLabel: 'Next review date', dueDays: 90,
    fields: [S('likelihood', 'Likelihood', LIKELIHOOD, { required: true }), S('impact', 'Impact', IMPACT, { required: true }), T('owner', 'Risk owner'), TA('controls', 'What is in place now'), TA('plan', 'What we will do to lower the risk')],
  },
  {
    key: 'inspections', icon: '🔎', title: 'External inspections & reviews', coa: 'ASE · RPM',
    summary: 'Licensing, MCFD/CLBC, fire, WorkSafeBC, insurance, financial audit and COA visits — the result and what must be fixed.',
    rules: ['Enter every outside inspection or review within 5 business days', 'Every finding has a corrective action with an owner and date', 'Attach the written report to the COA standard as evidence'],
    types: ['Community Care Licensing inspection', 'MCFD contract / standards review', 'CLBC monitoring visit', 'Fire inspection', 'WorkSafeBC inspection', 'Health inspection', 'Insurance review', 'Financial audit / review', 'COA site visit', 'Other'],
    titleHint: 'e.g. Licensing inspection — Maple House',
    dueLabel: 'Fix findings by', dueDays: 30,
    fields: [T('agency', 'Inspector / agency'), S('result', 'Result', ['Passed — no findings', 'Passed with findings', 'Not passed', 'Report pending'], { required: true }), N('finding_count', 'Number of findings'), YN('report', 'Written report received'), TA('findings', 'Findings'), TA('actions', 'Corrective actions (owner and date)')],
  },
  {
    key: 'rca', icon: '🧩', title: 'Root cause analysis', coa: 'RPM · BSM',
    summary: 'For serious incidents, medication errors, missing youth, restraints with injury and serious complaints: why it happened and how we stop it happening again.',
    rules: ['Started within 5 business days of a serious incident', 'Looks at systems, not blame', 'Learning shared with staff; actions tracked to completion'],
    types: ['Critical incident', 'Medication error', 'Missing youth', 'Restraint / injury', 'Serious complaint', 'Near miss', 'Other'],
    titleHint: 'e.g. Medication error 12 Oct — evening dose missed',
    resident: true, dueLabel: 'Actions done by', dueDays: 30,
    fields: [T('incident_ref', 'Incident date / reference'), T('team', 'Review team'), TA('what', 'What happened', { required: true }), TA('causes', 'Root causes (why it happened)'), TA('contributing', 'Contributing factors'), TA('actions', 'Actions to stop it happening again'), TA('shared', 'Who the learning was shared with')],
  },
  {
    key: 'plan', icon: '🎯', title: 'Yearly QA plan & goals', coa: 'PQI · GOV',
    summary: 'The written yearly quality plan: each goal, how it is measured, the target, and progress. Also the Board’s yearly review of quality.',
    rules: ['Written each year and approved by the Executive Director', 'Progress reviewed every quarter', 'Board reviews quality results at least once a year'],
    types: ['Yearly QA plan', 'Goal / measure', 'Board review of quality', 'Yearly program evaluation'],
    titleHint: 'e.g. Reduce restraints by 25%',
    dueLabel: 'Target date',
    fields: [T('measure', 'How it is measured'), T('target', 'Target'), T('result', 'Result so far'), S('progress', 'Progress', ['Not started', 'On track', 'At risk', 'Met', 'Not met']), TA('notes', 'Notes')],
  },
  {
    key: 'feedback', icon: '💬', title: 'Stakeholder feedback', coa: 'CR · PQI',
    summary: 'Compliments, suggestions and concerns from youth, families, social workers, funders, staff and the community — and how we answered.',
    rules: ['Acknowledged within 2 business days', 'Resolved or escalated within 30 days', 'Formal complaints also go through the complaints process'],
    types: ['Compliment', 'Suggestion', 'Concern', 'Formal complaint'],
    titleHint: 'e.g. Social worker praised the transition planning',
    dueLabel: 'Resolve by', dueDays: 30,
    fields: [S('source', 'From', ['Youth / adult served', 'Parent / guardian', 'Social worker / CLBC facilitator', 'Funder', 'Staff', 'Community / neighbour', 'Other'], { required: true }), T('received_by', 'Received by'), D('acknowledged', 'Date acknowledged'), TA('details', 'What they said', { required: true }), TA('response', 'Our response')],
  },
];

// Not shown in the "Enter records" list: the quarterly report sign-off, saved from the report page.
export const QA_QUARTER_SIGNOFF = {
  key: 'quarterly', title: 'Quarterly report sign-off', coa: 'PQI · GOV',
  fields: [TA('summary', 'Summary and highlights'), TA('concerns', 'Main concerns'), TA('priorities', 'Priorities for next quarter'), T('ed_name', 'Reviewed by (Executive Director)'), D('ed_date', 'Date reviewed'), D('board_date', 'Presented to the Board on'), T('board_ref', 'Board motion / minutes reference')],
};

export const findQaRecordType = (key) => [...QA_RECORD_TYPES, QA_QUARTER_SIGNOFF].find((t) => t.key === key) ?? null;

// Risk score = likelihood × impact.
export function riskScore(data) {
  const l = parseInt(data?.likelihood, 10), i = parseInt(data?.impact, 10);
  if (!l || !i) return null;
  const score = l * i;
  const level = score >= 20 ? 'Extreme' : score >= 10 ? 'High' : score >= 5 ? 'Medium' : 'Low';
  const tone = score >= 10 ? 'red' : score >= 5 ? 'yellow' : 'green';
  return { score, level, tone };
}
