// Careers page and online job applications (plan B5): the questions, sections and statuses.
// Modelled on the FNHA online application, changed for Evergreen's hiring rules and the Combined Pre-Screening Standard.

export const STATUSES = ['New', 'Screened', 'Interview', 'References', 'Pre-screening', 'Offer', 'Hired', 'Not selected', 'Withdrawn'];
export const OPEN_STATUSES = ['New', 'Screened', 'Interview', 'References', 'Pre-screening', 'Offer'];
// What the applicant sees for each status (kept general and polite).
export const APPLICANT_STATUS = {
  Draft: 'Not sent yet', New: 'Received', Screened: 'Being reviewed', Interview: 'Interview stage', References: 'Reference checks',
  'Pre-screening': 'Pre-screening checks', Offer: 'Offer stage', Hired: 'Hired — welcome!', 'Not selected': 'Closed', Withdrawn: 'Withdrawn',
};

export const SHIFT_TEAMS = ['Day', 'Evening', 'Awake night', 'Any'];
export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Full-time or part-time'];

// Section 3: prequalify. must = a "no" flags the application for HR (it does not stop it).
export function prequalQuestions(posting) {
  const q = [
    { key: 'age19', q: 'Are you 19 years of age or older?', must: true },
    { key: 'work_canada', q: 'Are you legally entitled to work in Canada?', must: true, expiry: true },
    { key: 'no_breaks', q: 'Evergreen staff work continuous paid duty with no separate breaks: you stay with the people in care for the whole shift and eat with them. Are you willing to work this way?', must: true },
    { key: 'shift', q: posting?.shift_team && posting.shift_team !== 'Any'
        ? `This job is on the ${posting.shift_team.toLowerCase()} team, with every other weekend. Are you available for that?`
        : 'Are you available for a fixed day, evening or awake-night team, with every other weekend?', must: true },
    { key: 'checks', q: 'Do you consent to a criminal record check and the MCFD / CLBC screening needed for this work, if you get an offer?', must: true },
    { key: 'outside_bc', q: 'Have you lived outside B.C. in the last 10 years? (If yes, out-of-province checks are needed. This does not stop your application.)', must: false },
  ];
  if (posting?.drives) q.splice(4, 0, { key: 'licence', q: 'This job includes driving the people in care. Do you have a valid B.C. driver’s licence (Class 5 or higher)?', must: true });
  return q;
}

export const EDUCATION_LEVELS = ['High school (Grade 12 / Dogwood)', 'GED / adult graduation', 'Certificate', 'Diploma', 'Associate degree', 'Bachelor’s degree', 'Master’s degree', 'Doctorate'];
// Highest level is worked out from what was entered, so the two can't disagree.
export const highestEducation = (list = []) => {
  const idx = list.map((e) => EDUCATION_LEVELS.indexOf(e?.level)).filter((i) => i >= 0);
  return idx.length ? EDUCATION_LEVELS[Math.max(...idx)] : null;
};

export const CERT_PICKS = ['First Aid / CPR', 'CPI or other de-escalation training', 'FoodSafe', 'Medication administration',
  'Class 5 driver’s licence', 'Social Service Worker diploma', 'Community Support Worker certificate', 'Other'];
export const LANG_LEVELS = ['Basic', 'Good', 'Fluent / native'];
export const HEARD = ['Evergreen website', 'Indeed', 'LinkedIn', 'Facebook / Instagram', 'WorkBC', 'School or college', 'An Evergreen staff member', 'Other'];

export const SECTIONS = [
  ['contact', 'Contact information'], ['job', 'Job applied for'], ['prequal', 'Prequalify'], ['files', 'Resume and cover letter'],
  ['education', 'Education'], ['work', 'Work experience'], ['certs', 'Licences and certifications'], ['languages', 'Languages'],
  ['refs', 'References'], ['referral', 'How you heard about us'], ['questions', 'Questions'], ['declaration', 'Declaration and signature'],
];

export const emptyAnswers = (start = {}) => ({
  contact: { first: start.first ?? '', last: start.last ?? '', email: start.email ?? '', phone: '', address: '', city: '', postal: '', preferred: '' },
  prequal: {},
  education: [{}], work: [{}], experience: { youth: '', adults: '', complex: '' },
  certs: [{}], languages: [{ language: 'English' }],
  refs: [{}, {}, {}],
  referral: { heard: '', staff: '', former: '' },
  questions: { wage: '', wage_unit: 'hour', conflict: '', conflict_detail: '', accommodation: '', selfid: {} },
});

const has = (v) => typeof v === 'string' ? v.trim() !== '' : v != null && v !== false;

// What is still missing before the application can be sent. Returns plain sentences.
export function missingFor(a, app) {
  const m = [];
  const c = a?.contact ?? {};
  if (!has(c.first) || !has(c.last)) m.push('Contact: your first and last name');
  if (!has(c.phone)) m.push('Contact: your phone number');
  if (!has(c.preferred)) m.push('Contact: how you would like us to contact you');
  for (const q of prequalQuestions(app?.posting)) if (!has(a?.prequal?.[q.key])) m.push(`Prequalify: “${q.q.slice(0, 60)}…”`);
  if (!app?.resume_path) m.push('Resume: upload your resume (PDF or Word)');
  const refs = (a?.refs ?? []).filter((r) => has(r?.name) && has(r?.email) && has(r?.phone) && has(r?.agency));
  if (refs.length < 3) m.push('References: three supervisors, each with name, agency, email and phone');
  if (!has(a?.questions?.conflict)) m.push('Questions: conflict of interest');
  return m;
}

// "No" answers to must-have questions: shown to HR as flags (they don't stop the application).
export function flagsFor(a, posting) {
  return prequalQuestions(posting).filter((q) => q.must && a?.prequal?.[q.key] === 'no').map((q) => q.q);
}

export const wageText = (p) => !p?.wage_min ? null
  : `$${Number(p.wage_min).toLocaleString('en-CA', { minimumFractionDigits: p.wage_unit === 'hour' ? 2 : 0 }).replace(/\s?([ap])\.m\./g, ' $1m')}${p.wage_max && Number(p.wage_max) !== Number(p.wage_min) ? ` to $${Number(p.wage_max).toLocaleString('en-CA', { minimumFractionDigits: p.wage_unit === 'hour' ? 2 : 0 }).replace(/\s?([ap])\.m\./g, ' $1m')}` : ''} per ${p.wage_unit}`;
