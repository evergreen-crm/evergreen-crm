// Evergreen Combined Pre-Screening Standard — shared lists and clearance rules.
// Used by the HR pages (server) and the applicant form (browser), so no server-only imports here.

export const POSITIONS = ['Youth Care Worker', 'Residential Support Worker (Adults)', 'Community Support Worker',
  'Relief / Casual Support Worker', 'Overnight Awake Support', 'House Lead / Coordinator', 'Caregiver', 'Volunteer'];
export const WORKER_TYPES = ['Employee', 'Relief worker', 'Contractor', 'Caregiver', 'Volunteer'];
export const PROGRAMS = [['MCFD', 'Children & youth (MCFD)'], ['CLBC', 'Adults (CLBC)'], ['Both', 'Both']];
export const AVAIL = ['Days', 'Evenings', 'Overnights (awake)', 'Weekends', 'Statutory holidays', 'On-call / relief'];
export const POPS = ['Children & youth', 'Adults with developmental disabilities', 'Mental health', 'Substance use',
  'Autism spectrum', 'FASD', 'Complex behaviours', 'Seniors / personal care'];
export const YEARS = ['Less than 1 year', '1–2 years', '3–5 years', '6–10 years', 'More than 10 years'];
export const REF_RELATIONS = ['Manager / supervisor', 'Co-worker', 'Team lead', 'Instructor / practicum supervisor', 'Other professional'];

// What the applicant says they hold today.
export const SELF = [
  { k: 'firstaid', l: 'Standard First Aid & CPR', exp: true },
  { k: 'crisis', l: 'Behaviour support / de-escalation (NVCI, MANDT, CPI)', exp: true },
  { k: 'meds', l: 'Medication administration', exp: true },
  { k: 'whmis', l: 'WHMIS', exp: true },
  { k: 'foodsafe', l: 'FoodSafe Level 1', exp: true },
  { k: 'licence', l: "Valid BC driver's licence", exp: true },
  { k: 'edu', l: 'Diploma / certificate (CSW, CYC, HCA or related)', exp: false },
  { k: 'crc', l: 'Criminal record check done in the last 12 months', exp: false },
];

// tag: all | youth | adult | driver | meds | outside | cond (where applicable)
// step: the workflow step the item belongs to. exp: has an expiry / renewal date.
const S = (n, t, items) => ({ n, t, items: items.map(([k, l, tag, step, exp]) => ({ k, l, tag, step, exp: !!exp, sec: n })) });
export const SECTIONS = [
  S(1, 'Application & identification', [
    ['app', 'Employment application (signed prescreen)', 'all', 'application'],
    ['resume', 'Resume', 'all', 'application'],
    ['govid', 'Government-issued ID sighted (record the type only, never the number)', 'all', 'application'],
    ['dob', 'Date of birth confirmed', 'all', 'application'],
    ['contact', 'Address & contact information confirmed', 'all', 'application'],
    ['emphist', 'Employment history reviewed', 'all', 'application'],
    ['exp', 'Relevant caregiving experience reviewed', 'all', 'application']]),
  S(2, 'Interview & suitability assessment', [
    ['interview', 'Structured interview', 'all', 'interview'],
    ['competency', 'Competency assessment', 'all', 'interview'],
    ['suitability', 'Suitability / character assessment', 'all', 'interview'],
    ['coi', 'Conflict-of-interest declaration', 'all', 'interview'],
    ['boundaries', 'Professional-boundary assessment', 'all', 'interview']]),
  S(3, 'Reference & background verification', [
    ['refs3', 'Three professional reference checks (one must be a manager / supervisor)', 'all', 'references'],
    ['prevemp', 'Previous employment verified', 'all', 'references'],
    ['eduv', 'Education verified', 'all', 'references'],
    ['reg', 'Professional registration verified', 'cond', 'references'],
    ['certv', 'Certifications verified', 'all', 'references']]),
  S(4, 'Criminal & child/welfare screening', [
    ['crc', 'Criminal record check (BC)', 'all', 'background', 1],
    ['crra', 'Criminal Records Review Act clearance (vulnerable sector)', 'all', 'background', 1],
    ['ooj', 'Out-of-jurisdiction checks', 'outside', 'background'],
    ['oojcrc', 'Out-of-jurisdiction criminal record checks', 'outside', 'background'],
    ['mcfd', 'MCFD screening for child / youth services', 'youth', 'program'],
    ['irr', 'Initial Record Review (IRR)', 'youth', 'program'],
    ['drr', 'Detailed Record Review (DRR), where applicable', 'youth', 'program'],
    ['clbc', 'CLBC contract screening requirements', 'adult', 'program'],
    ['licscreen', 'Community care licensing screening, where applicable', 'cond', 'program']]),
  S(5, 'Health & fitness requirements', [
    ['immun', 'Immunization requirements', 'all', 'health', 1],
    ['tb', 'Tuberculosis requirements', 'all', 'health', 1],
    ['healthother', 'Other licensing, contract or position health requirements', 'cond', 'health']]),
  S(6, 'Driver screening', [
    ['licence', "Valid driver's licence", 'driver', 'driver', 1],
    ['abstract', "Driver's abstract", 'driver', 'driver', 1],
    ['insurance', 'Insurance verification', 'driver', 'driver', 1],
    ['safedrive', 'Safe-driving assessment', 'driver', 'driver'],
    ['vehicle', 'Vehicle authorization, where applicable', 'driver', 'driver']]),
  S(7, 'Required training', [
    ['t_firstaid', 'First Aid / CPR', 'all', 'training', 1],
    ['t_emerg', 'Emergency procedures', 'all', 'training'],
    ['t_abuse', 'Abuse / neglect reporting', 'all', 'training'],
    ['t_trauma', 'Trauma-informed practice', 'all', 'training'],
    ['t_deesc', 'Behaviour support / de-escalation', 'all', 'training', 1],
    ['t_meds', 'Medication administration', 'meds', 'training', 1],
    ['t_ipc', 'Infection prevention & control', 'all', 'training'],
    ['t_whmis', 'WHMIS', 'all', 'training', 1],
    ['t_ohs', 'Occupational health & safety', 'all', 'training'],
    ['t_privacy', 'Privacy / confidentiality', 'all', 'training'],
    ['t_cultural', 'Cultural safety', 'all', 'training'],
    ['t_indig', 'Indigenous cultural awareness', 'all', 'training'],
    ['t_rights', 'Resident / client rights', 'all', 'training'],
    ['t_youth', 'Program-specific training: children & youth (MCFD)', 'youth', 'training'],
    ['t_adult', 'Program-specific training: adults (CLBC)', 'adult', 'training']]),
  S(8, 'Final clearance', [
    ['hrrev', 'HR review', 'all', 'approval'],
    ['pmrev', 'Program Manager review', 'all', 'approval'],
    ['contractclr', 'Required MCFD / contract / licensing clearance', 'all', 'approval'],
    ['outstanding', 'Outstanding-items review', 'all', 'approval'],
    ['exec', 'Executive / authorized management approval (administrator only)', 'all', 'approval']]),
];
export const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);
export const ITEM_KEYS = new Set(ALL_ITEMS.map((i) => i.k));
export const TAG_LABEL = { youth: 'Children & youth', adult: 'Adults', driver: 'Drivers', meds: 'Gives medication', outside: 'Lived outside BC', cond: 'If applicable' };
export const ITEM_ST = [['todo', 'Not started'], ['pending', 'Received, in review'], ['ok', 'Verified'], ['na', 'Not applicable'], ['fail', 'Unsuccessful']];

export const STEPS = [['application', 'Application'], ['interview', 'Interview'], ['references', 'References'],
  ['background', 'Background check'], ['program', 'MCFD / CLBC / licensing'], ['health', 'Health'], ['driver', 'Driver'],
  ['training', 'Training'], ['approval', 'Management approval'], ['cleared', 'Cleared'], ['orientation', 'Orientation'],
  ['competency', 'Competency'], ['independent', 'Independent work']];
export const POST = ['orientation', 'competency', 'independent'];

export const INTERVIEW = [
  'Tell us about your experience supporting children, youth, or adults with developmental disabilities, mental health needs, or complex behaviours.',
  'Describe a time you helped someone who was escalating or in crisis. What did you do, and how did it end?',
  'A person in care refuses their evening medication. Walk us through what you would do and what you would document.',
  'What does trauma-informed care look like on an ordinary shift?',
  'How do you keep professional boundaries with clients, families, and on social media?',
  'If you suspected a client was being harmed or neglected, what would you do, and who would you report it to?',
  'What makes a good shift note or incident report? Give an example of something you would write.',
  'How do you handle working alone on an overnight, or a disagreement with a co-worker?',
  "How do you show respect for a resident's culture, identity and rights, including Indigenous residents?",
  'Why do you want to work in residential care, and why Evergreen?',
];
export const REFQ = [
  'How do you know the applicant, and for how long? What was their position?',
  'Dates of employment (start and end).',
  'How was their reliability and attendance?',
  'How did they work with clients or vulnerable people?',
  'How did they handle stress, conflict, or a crisis?',
  'What are their strengths? Where could they grow?',
  'Do you have any concerns about this person working with children, youth, or vulnerable adults?',
];

export const CLEARANCE = {
  green: { label: 'GREEN – CLEARED', text: 'All required screening completed.' },
  yellow: { label: 'YELLOW – CONDITIONAL', text: 'Documentation or approval outstanding; duties restricted until authorized.' },
  red: { label: 'RED – NOT CLEARED', text: 'Required screening or approval unsuccessful or incomplete.' },
};

// ---------- Rules ----------
export function applies(item, p) {
  switch (item.tag) {
    case 'youth': return p.program === 'MCFD' || p.program === 'Both';
    case 'adult': return p.program === 'CLBC' || p.program === 'Both';
    case 'driver': return !!p.drives;
    case 'meds': return !!p.gives_meds;
    case 'outside': return !!p.lived_outside;
    default: return true;
  }
}
export const itemsFor = (p) => ALL_ITEMS.filter((i) => applies(i, p));
export const stOf = (p, k) => p.items?.[k]?.st || 'todo';
const done = (p, k) => ['ok', 'na'].includes(stOf(p, k));
export const interviewCount = (p) => Object.values(p.interview?.scores ?? {}).filter((n) => Number(n) > 0).length;
export function interviewAvg(p) {
  const v = Object.values(p.interview?.scores ?? {}).map(Number).filter((n) => n > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
export const refsDone = (p) => (p.ref_checks ?? []).filter((r) => r?.done).length;
export const managerConfirmed = (p) => (p.ref_checks ?? []).some((r) => r?.done && r?.mgr);

export function stepState(p) {
  const items = itemsFor(p);
  const failed = items.some((i) => stOf(p, i.k) === 'fail');
  const out = {};
  for (const [k] of STEPS) {
    if (k === 'cleared') { out[k] = !failed && STEPS.slice(0, 9).every(([x]) => out[x] !== 'todo') ? 'done' : 'todo'; continue; }
    if (POST.includes(k)) { out[k] = p.post?.[k]?.at ? 'done' : 'todo'; continue; }
    const its = items.filter((i) => i.step === k);
    let ok = its.every((i) => done(p, i.k));
    if (k === 'application') ok = ok && p.link_status === 'Submitted';
    if (k === 'interview') ok = ok && interviewCount(p) >= INTERVIEW.length;
    if (k === 'references') ok = ok && refsDone(p) >= 3 && managerConfirmed(p);
    out[k] = its.length === 0 ? 'skip' : ok ? 'done' : 'todo';
  }
  return out;
}
export function currentStep(p) {
  const st = stepState(p);
  return STEPS.find(([k]) => st[k] === 'todo') ?? ['done', 'Working independently'];
}
export function clearance(p) {
  if (p.file_status === 'Not moving forward' || itemsFor(p).some((i) => stOf(p, i.k) === 'fail')) return 'red';
  return stepState(p).cleared === 'done' ? 'green' : 'yellow';
}
export function outstanding(p) {
  const list = itemsFor(p).filter((i) => !done(p, i.k)).map((i) => i.l);
  if (p.link_status !== 'Submitted') list.unshift('Applicant has not signed the prescreen yet');
  if (interviewCount(p) < INTERVIEW.length) list.unshift(`Interview: ${INTERVIEW.length - interviewCount(p)} question(s) not scored`);
  if (refsDone(p) < 3) list.unshift(`References: ${3 - refsDone(p)} check(s) open`);
  if (!managerConfirmed(p)) list.unshift('References: no manager / supervisor confirmed');
  return list;
}
export function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date(new Date().toISOString().slice(0, 10));
  return Math.round((new Date(iso) - today) / 86400000);
}
export function renewals(p) {
  return ALL_ITEMS.filter((i) => i.exp && p.items?.[i.k]?.exp)
    .map((i) => ({ k: i.k, l: i.l, exp: p.items[i.k].exp, days: daysUntil(p.items[i.k].exp) }))
    .sort((a, b) => a.days - b.days);
}
// Extra screening the applicant's answers trigger (shown on the applicant form).
export function extraNeeds({ program, drives, outside }) {
  const n = ['A criminal record check under the Criminal Records Review Act'];
  if (program === 'MCFD' || program === 'Both') n.push('MCFD screening, an Initial Record Review and, if required, a Detailed Record Review');
  if (program === 'CLBC' || program === 'Both') n.push('CLBC contract screening requirements and adult program training');
  if (drives) n.push("Driver's licence, driver's abstract, insurance and a safe-driving assessment");
  if (outside) n.push('Criminal record checks from every place you have lived outside BC');
  return n;
}

// ---------- Applicant form check (browser and server) ----------
export function validateApplication(a, signedName, signature) {
  const e = [];
  const ap = a?.applicant ?? {}, sc = a?.screen ?? {}, ex = a?.experience ?? {}, refs = a?.refs ?? [], c = a?.consent ?? {};
  if (!ap.first || !ap.last) e.push('Enter your first and last name.');
  if (!ap.dob) e.push('Enter your date of birth.');
  if (!ap.phone) e.push('Enter a phone number.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ap.email ?? '')) e.push('Enter a valid email address.');
  if (!ap.address) e.push('Enter your home address.');
  if (!ap.position) e.push("Choose the position you're applying for.");
  if (!ap.type) e.push("Choose how you're applying (employee, relief, contractor…).");
  if (!ap.program) e.push('Choose who you will work with: children & youth, adults, or both.');
  if (!sc.drive || !sc.outside || !sc.coi) e.push('Answer all three screening questions.');
  if (sc.coi === 'yes' && !sc.coiDetail) e.push('Explain the conflict of interest.');
  if (!ex.years) e.push('Choose your years of experience.');
  if ((ex.summary ?? '').trim().length < 40) e.push('Describe your experience in a few sentences (at least 40 characters).');
  [0, 1, 2].forEach((i) => { const r = refs[i] ?? {}; if (!r.name || !r.title || !r.org || !r.rel || !r.phone) e.push(`Complete reference ${i + 1} (name, title, organization, relationship and phone).`); });
  if (!refs.some((r) => r?.rel === 'Manager / supervisor')) e.push('At least one reference must be a manager or supervisor.');
  if (!c.truthful || !c.verify || !c.screening) e.push('Tick all three boxes in the declaration.');
  if (!signedName?.trim()) e.push('Type your full legal name.');
  if (!signature?.startsWith?.('data:image/png;base64,')) e.push('Sign in the signature box.');
  return e;
}
