// The applicant's requirements checklist (from the Evergreen Combined Pre-Screening Standard), used in three places:
// the pre-screen form (the applicant ticks each item and uploads documents), each public job posting ("What you need")
// and the HR pre-screening file. Only the items that apply to the job are shown.
// when: all | youth (MCFD) | adult (CLBC) | driver | meds | outside (lived outside BC)
// kind: confirm (yes / no) · doc (upload a photo or PDF, with expiry if exp) · consent · later (Evergreen trains after hire)
// selfKey: the matching key in the older "certificates you have now" answers (kept so older screens still read).
export const CHECKLIST = [
  { group: 'About you', items: [
    { k: 'age19', l: 'I am 19 years of age or older', kind: 'confirm', when: 'all' },
    { k: 'work_canada', l: 'I am legally entitled to work in Canada', kind: 'confirm', when: 'all' },
  ] },
  { group: 'Documents', items: [
    { k: 'resume', l: 'Resume', kind: 'resume', when: 'all', hint: 'PDF, Word or a photo' },
    { k: 'govid', l: 'Government photo ID (driver’s licence, BC Services Card or passport)', kind: 'confirm', when: 'all', hint: 'Bring it to your interview. Don’t upload it: we only record the type of ID, never the number.' },
    { k: 'edu', l: 'Diploma or certificate (Community Support Worker, Child & Youth Care, Health Care Assistant or related)', kind: 'doc', when: 'all', selfKey: 'edu', optional: true },
  ] },
  { group: 'Checks', items: [
    { k: 'crc', l: 'Criminal record check, vulnerable sector (Criminal Records Review Act)', kind: 'consent', when: 'all', selfKey: 'crc', hint: 'If you get an offer, we send you the link to do it online. If you did one in the last 12 months, you can upload it.' },
    { k: 'outside', l: 'Criminal record checks from the provinces or countries where I lived', kind: 'consent', when: 'outside' },
    { k: 'mcfd', l: 'MCFD screening (children and youth)', kind: 'consent', when: 'youth' },
    { k: 'clbc', l: 'CLBC contract screening (adults)', kind: 'consent', when: 'adult' },
  ] },
  { group: 'Certificates', items: [
    { k: 'firstaid', l: 'Standard First Aid & CPR', kind: 'doc', exp: true, when: 'all', selfKey: 'firstaid' },
    { k: 'crisis', l: 'Behaviour support / de-escalation (NVCI, CPI or MANDT)', kind: 'doc', exp: true, when: 'all', selfKey: 'crisis', optional: true },
    { k: 'meds', l: 'Medication administration', kind: 'doc', exp: true, when: 'meds', selfKey: 'meds', optional: true },
    { k: 'whmis', l: 'WHMIS', kind: 'doc', exp: true, when: 'all', selfKey: 'whmis', optional: true },
    { k: 'foodsafe', l: 'FoodSafe Level 1', kind: 'doc', exp: true, when: 'all', selfKey: 'foodsafe', optional: true },
  ] },
  { group: 'Health', items: [
    { k: 'immun', l: 'Immunizations and TB test, if the contract asks for them', kind: 'consent', when: 'all', hint: 'We tell you after the interview if your job needs them.' },
  ] },
  { group: 'Driving', items: [
    { k: 'licence', l: 'Valid BC driver’s licence (Class 5 or higher)', kind: 'doc', exp: true, when: 'driver', selfKey: 'licence' },
    { k: 'abstract', l: 'Driver’s abstract (driving record) from ICBC', kind: 'consent', when: 'driver' },
    { k: 'insurance', l: 'Vehicle insurance, if you drive your own car for work', kind: 'consent', when: 'driver' },
  ] },
  { group: 'How we work', items: [
    { k: 'noBreaks', l: 'Continuous paid duty with no separate breaks: I stay with the people in care for the whole shift and eat with them', kind: 'confirm', when: 'all' },
    { k: 'teams', l: 'Fixed team (day, evening or awake night) with every other weekend', kind: 'confirm', when: 'all' },
  ] },
  { group: 'Evergreen trains you after you are hired', items: [
    { k: 'academy', l: 'Orientation and Evergreen Academy courses: abuse and neglect reporting, trauma-informed practice, privacy, rights, cultural safety, emergency procedures and more', kind: 'later', when: 'all' },
  ] },
];

// { program: 'MCFD'|'CLBC'|'Both', drives, meds, outside }
export function checklistFor(o = {}) {
  const youth = o.program === 'MCFD' || o.program === 'Both' || !o.program;
  const adult = o.program === 'CLBC' || o.program === 'Both' || !o.program;
  const ok = (w) => w === 'all' || (w === 'youth' && youth) || (w === 'adult' && adult) || (w === 'driver' && o.drives) || (w === 'meds' && o.meds !== false) || (w === 'outside' && o.outside);
  return CHECKLIST.map((g) => ({ ...g, items: g.items.filter((i) => ok(i.when)) })).filter((g) => g.items.length);
}

export const STATUS = { yes: 'I have it', progress: 'In progress', no: 'Not yet' };

// Which checklist items still need an answer before the pre-screen can be sent.
export function checklistErrors(check = {}, groups, files = {}) {
  const e = [];
  for (const g of groups) for (const i of g.items) {
    const v = check[i.k] ?? {};
    if (i.kind === 'later') continue;
    if (i.kind === 'resume') { if (!files.resume) e.push('Upload your resume.'); continue; }
    if ((i.kind === 'confirm' || i.kind === 'consent') && v.status !== 'yes' && v.status !== 'no') e.push(`Checklist: answer “${i.l.slice(0, 60)}”.`);
    if (i.kind === 'doc' && !v.status) e.push(`Checklist: choose I have it, In progress or Not yet for “${i.l.slice(0, 50)}”.`);
    if (i.kind === 'doc' && v.status === 'yes' && i.exp && !v.exp) e.push(`Checklist: add the expiry date for “${i.l.slice(0, 50)}”.`);
  }
  return e;
}
