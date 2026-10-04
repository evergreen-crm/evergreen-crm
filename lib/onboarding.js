// New staff onboarding checklist — from Evergreen's Organizational Divisions (ECC-DIV-2026-001):
// Standard G.1 personnel file (14 items), signed policies, and the G.3 mandatory training matrix.
// kind: upload | refs | declare | sign | training | manager
// days = due this many days after the hire date. renewMonths = training renewal cycle.

export const FILE_ITEMS = [
  { key: 'crc', no: 1, title: 'Criminal Record Check — Vulnerable Sector', kind: 'upload', days: 0,
    help: 'Upload your clearance letter. No one works with youth until a clear CRC is on file. Renewed every 5 years.' },
  { key: 'references', no: 2, title: 'Two professional references', kind: 'refs', days: 0,
    help: 'Names and phone numbers of two professional references.' },
  { key: 'medical', no: 3, title: 'Fitness for duty declaration', kind: 'declare', days: 30,
    help: 'Confirm you are fit for the duties of the role. You do not need to share a diagnosis.' },
  { key: 'resume', no: 4, title: 'Application / résumé', kind: 'upload', days: 0, help: 'Upload your résumé.' },
  { key: 'qualifications', no: 5, title: 'Education and professional qualifications', kind: 'upload', days: 30,
    help: 'Upload diplomas, transcripts or certificates for the role.' },
  { key: 'offer', no: 6, title: 'Offer letter and acceptance', kind: 'sign', days: 0,
    statement: 'I accept the offer of employment with Evergreen Community Care Inc. on the terms in my offer letter.' },
  { key: 'orientation', no: 7, title: 'Orientation acknowledgement', kind: 'sign', days: 0,
    statement: 'I completed orientation, including the OHS orientation, emergency procedures and a tour of the program, before my first independent shift.' },
  { key: 'start_date', no: 11, title: 'Start date confirmed (manager)', kind: 'manager', days: 0,
    help: 'Manager confirms the date of commencement.' },
];

export const POLICIES = [
  { key: 'rc_manual', title: 'RC Program Manual (ECC-RC-POL-2026-003)' },
  { key: 'hr_binder', title: 'HR Policy Binder (ECC-HR-POL-2026-001)' },
  { key: 'ohs_binder', title: 'OHS Program Binder (ECC-OHS-POL-2026-002)' },
  { key: 'program_desc', title: 'Program Description (Standard A)' },
  { key: 'job_desc', title: 'My job description' },
  { key: 'code_ethics', title: 'Code of Ethics and professional conduct' },
  { key: 'confidentiality', title: 'Confidentiality and privacy (FOIPPA)',
    statement: 'I will keep all information about youth, families and staff confidential, share it only as needed for care, and report any privacy breach to my manager within 24 hours.' },
  { key: 'youth_rights', title: 'Rights of children and youth in care (CFCSA s.70)',
    statement: 'I will respect every right of youth in care and will never interfere with a youth’s access to the Advocate (RCY), Ombudsperson, social worker or police.' },
  { key: 'duty_report', title: 'Duty to report (CFCSA s.14)',
    statement: 'I understand my legal duty to report any reason to believe a child or youth needs protection, directly and without delay.' },
  { key: 'gender_affirming', title: 'Gender-affirming care (Standard D, April 2024)',
    statement: 'I will use every youth’s correct name and pronouns from Day 1 and keep gender identity confidential without informed consent.' },
  { key: 'restraint', title: 'Physical restraint and prohibited practices',
    statement: 'I understand restraint is a last resort only, prone restraint and seclusion are prohibited, and corporal punishment, withholding meals, humiliation and threats of removal are never allowed.' },
].map((p, i) => ({ ...p, kind: 'sign', days: 7, sort: i,
  statement: p.statement ?? `I have received, read and understand the ${p.title}, and I agree to follow it.` }));

export const TRAINING_MATRIX = [
  { key: 'ohs_orientation', hours: 4, title: 'OHS Orientation + Program Manual', days: 0, renewMonths: 12, when: 'Day 1 — before first independent shift', provider: 'In person with the Program Coordinator', inHouse: true },
  { key: 'youth_rights_trn', hours: 2, title: 'Youth Rights (CFCSA s.70)', days: 7, renewMonths: 24, when: 'Before first solo shift (within 7 days)', provider: 'BC Gov eLearning Hub (learning.gov.bc.ca)' },
  { key: 'mandatory_reporting', hours: 1.5, title: 'Mandatory Reporting (CFCSA s.14)', days: 30, renewMonths: 24, when: 'Within 30 days', provider: 'mcf.gov.bc.ca/reporting' },
  { key: 'privacy', hours: 1, title: 'Privacy and FOIPPA', days: 30, renewMonths: 12, when: 'Within 30 days', provider: 'oipc.bc.ca module' },
  { key: 'whmis', hours: 1.5, title: 'WHMIS 2015', days: 0, renewMonths: 36, when: 'Before first shift', provider: 'worksafebc.com' },
  { key: 'abuse', hours: 3, title: 'Abuse Recognition and Prevention', days: 30, renewMonths: 12, when: 'Within 30 days', provider: 'Provider assigned by the PM' },
  { key: 'missing_youth', hours: 1, title: 'Missing Child/Youth Protocol', days: 30, renewMonths: 12, when: 'Within 30 days', provider: 'MCFD policy' },
  { key: 'violence', hours: 2, title: 'Workplace Violence Prevention', days: 0, renewMonths: 12, when: 'Before first shift', provider: 'worksafebc.com' },
  { key: 'first_aid', hours: 16, title: 'First Aid / CPR Level C', days: 30, renewMonths: null, when: 'Within 30 days; before first unsupervised shift', provider: 'Red Cross, St. John or equivalent' },
  { key: 'ofa2', hours: 16, title: 'OFA Level 2 (designated first aid attendant)', days: 0, renewMonths: null, when: 'Before first duty as designated FAA', provider: 'WorkSafeBC-recognized provider', ifApplicable: true },
  { key: 'nvci', hours: 7, title: 'Non-Violent Crisis Intervention (NVCI)', days: 90, renewMonths: 12, when: 'Module 1 before solo shift; full certification within 90 days', provider: 'crisisprevention.com + in person' },
  { key: 'trauma', hours: 6, title: 'Trauma-Informed Practice', days: 60, renewMonths: 24, when: 'Within 60 days', provider: 'BC Campus (bccampus.ca)' },
  { key: 'ics', hours: 8, title: 'Indigenous Cultural Safety and Humility', days: 60, renewMonths: 12, when: 'Within 60 days', provider: 'San’yas (sanyas.ca) or FNHA' },
  { key: 'gac', hours: 3, title: 'Gender-Affirming Care (mandatory, G.3.2(b))', days: 60, renewMonths: 12, when: 'Within 60 days', provider: 'Trans Care BC / PHSA' },
  { key: 'lgbtq', hours: 2, title: 'LGBTQ2S+ Inclusion', days: 60, renewMonths: 12, when: 'Within 60 days', provider: 'PFLAG Canada' },
  { key: 'asist', hours: 14, title: 'Suicide and Self-Harm Response (ASIST or safeTALK)', days: 60, renewMonths: 24, when: 'Within 60 days', provider: 'LivingWorks (livingworks.net)' },
  { key: 'medication', hours: 6, title: 'Medication Administration', days: 0, renewMonths: 12, when: 'Before any medication duty', provider: 'BC medication administration curriculum + in person', ifApplicable: true, inHouse: true },
  { key: 'working_alone', hours: 1, title: 'Working Alone Safety', days: 0, renewMonths: 12, when: 'Before first solo overnight shift', provider: 'worksafebc.com', ifApplicable: true },
  { key: 'driver', hours: 2, title: 'Driver Safety + annual driver’s abstract', days: 0, renewMonths: 12, when: 'Before first driving duty', provider: 'Employer orientation; ICBC', ifApplicable: true, inHouse: true },
].map((t) => ({ ...t, kind: 'training' }));

// Policies are signed in the Policy library (/policies), so they are not checklist items.
export const SECTIONS = [
  { key: 'file', title: 'Personnel file (Standard G.1)', items: FILE_ITEMS },
  { key: 'training', title: 'Evergreen Academy — mandatory training (Standard G.3)', items: TRAINING_MATRIX },
];
export const LEGACY_SECTIONS = [{ key: 'policy', title: 'Policies signed in onboarding', items: POLICIES }];

export const POLICY_CATEGORIES = ['HR', 'Program / residential care', 'OHS / safety', 'Finance', 'Quality assurance', 'Privacy', 'Code of conduct', 'Job descriptions', 'Other'];

// Training status for Evergreen Academy: the newest record for each training title.
export function trainingStatus(records, title, today) {
  const mine = records.filter((r) => r.title.toLowerCase() === title.toLowerCase())
    .sort((a, b) => (b.completed_on ?? '').localeCompare(a.completed_on ?? ''));
  const last = mine[0];
  if (!last) return { key: 'missing', label: 'Not done', last: null };
  if (!last.verified_by) return { key: 'pending', label: 'Waiting for verification', last };
  if (last.expires_on && last.expires_on < today) return { key: 'expired', label: `Expired ${last.expires_on}`, last };
  if (last.expires_on && (new Date(last.expires_on) - new Date(today)) / 86400000 <= 30) return { key: 'soon', label: `Renew by ${last.expires_on}`, last };
  return { key: 'ok', label: last.expires_on ? `Valid until ${last.expires_on}` : 'Complete', last };
}
// Typical course length (hours) for each Evergreen Academy module — used on certificates
// when the staff member doesn't enter their own hours. Change them here if a course differs.
export function hoursFor(title) {
  const t = TRAINING_MATRIX.find((x) => x.title.toLowerCase() === (title ?? '').toLowerCase());
  return t?.hours ?? null;
}
export function renewMonthsFor(title) {
  const t = TRAINING_MATRIX.find((x) => x.title.toLowerCase() === (title ?? '').toLowerCase());
  return t ? t.renewMonths : 12; // other training: renew every year
}
export function addMonthsISO(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10);
}

export function templateFor(key) {
  for (const s of SECTIONS) { const it = s.items.find((i) => i.key === key); if (it) return it; }
  return null;
}

export function certificateNo(training) {
  return training.certificate_no ?? `ECC-${(training.completed_on ?? '').slice(0, 4)}-${training.id.slice(0, 6).toUpperCase()}`;
}
