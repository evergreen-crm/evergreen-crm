// 📋 Satisfaction surveys (COA PQI: feedback from persons served and stakeholders).
// Questions are answered 1–5 (1 = strongly disagree … 5 = strongly agree). A "yes / no" safety question
// answered "no", or an average under 3, counts as a concern: directors are alerted and an improvement
// action is opened automatically.

export const SCALE = ['Strongly disagree', 'Disagree', 'Not sure', 'Agree', 'Strongly agree'];

const common = (who) => [
  { id: 'respect', text: `Staff treat ${who} with respect and kindness.` },
  { id: 'listen', text: `Staff listen to ${who} and take ${who === 'me' ? 'my' : 'their'} ideas seriously.` },
];

export const SURVEYS = {
  youth: {
    title: 'How are things at your home?', audience: 'Youth / resident', coa: 'CR · GLS',
    intro: 'Your answers help us make your home better. There are no wrong answers. You can skip any question.',
    questions: [
      { id: 'safe', text: 'I feel safe in my home.', yesno: true },
      ...common('me'),
      { id: 'plan', text: 'I help make my plan and my goals.' },
      { id: 'family', text: 'I can see or talk to my family and people who matter to me.' },
      { id: 'culture', text: 'My culture, language and beliefs are respected.' },
      { id: 'complain', text: 'I know how to make a complaint and who to call (like the Representative for Children and Youth).' },
      { id: 'overall', text: 'Overall, I am happy living here.' },
    ],
  },
  family: {
    title: 'Family and guardian feedback', audience: 'Parent / guardian', coa: 'CR · GLS',
    intro: 'Thank you for helping us improve the care your family member receives. Your answers are kept private.',
    questions: [
      { id: 'safe', text: 'My family member is safe and well cared for.', yesno: true },
      ...common('my family member'),
      { id: 'informed', text: 'I am kept informed about important events, incidents and changes.' },
      { id: 'involved', text: 'I am involved in planning and decisions.' },
      { id: 'contact', text: 'Visits and contact with my family member are supported.' },
      { id: 'overall', text: 'Overall, I am satisfied with Evergreen’s services.' },
    ],
  },
  social_worker: {
    title: 'Social worker feedback', audience: 'Social worker', coa: 'PQI · GLS',
    intro: 'Your feedback on our service to the youth or adult in your care helps us meet COA standards and your expectations.',
    questions: [
      { id: 'safe', text: 'The person is safe and their needs are met.', yesno: true },
      { id: 'reports', text: 'Incident reports and updates arrive on time and are complete.' },
      { id: 'plan', text: 'Evergreen follows the care plan and works toward its goals.' },
      { id: 'communication', text: 'Staff are easy to reach and respond quickly.' },
      { id: 'team', text: 'Evergreen works well with the care team.' },
      { id: 'overall', text: 'Overall, I am satisfied with Evergreen’s services.' },
    ],
  },
  funder: {
    title: 'Funder feedback', audience: 'Funder contact (MCFD / CLBC)', coa: 'PQI · GOV',
    intro: 'Your feedback helps us meet our contract, licensing and accreditation standards.',
    questions: [
      { id: 'contract', text: 'Evergreen meets the service requirements of the contract.' },
      { id: 'reports', text: 'Required reports (incidents, reviews, billing) are accurate and on time.' },
      { id: 'communication', text: 'Evergreen communicates openly and responds quickly.' },
      { id: 'quality', text: 'The quality of care meets or exceeds expectations.' },
      { id: 'overall', text: 'Overall, I am satisfied with Evergreen as a service provider.' },
    ],
  },
  staff: {
    title: 'Staff feedback', audience: 'Staff (yearly)', coa: 'HR · TS',
    intro: 'This survey is confidential. Only the directors see the results, and they are reported as a group.',
    questions: [
      { id: 'safe', text: 'I feel safe at work.', yesno: true },
      { id: 'supported', text: 'My supervisor supports me and gives me regular supervision.' },
      { id: 'training', text: 'I have the training I need to do my job well.' },
      { id: 'respect', text: 'I am treated with respect, and bullying or harassment is not tolerated.' },
      { id: 'schedule', text: 'My schedule and workload are fair.' },
      { id: 'voice', text: 'My ideas and concerns are listened to.' },
      { id: 'overall', text: 'Overall, I would recommend Evergreen as a place to work.' },
    ],
  },
  new_hire: {
    title: 'Your first 90 days', audience: 'New staff (90 days)', coa: 'HR · TS',
    intro: 'Tell us how your orientation and first three months went. Only the directors see the results.',
    questions: [
      { id: 'orientation', text: 'My orientation prepared me for my job.' },
      { id: 'training', text: 'I received the training I needed before working on my own.' },
      { id: 'supported', text: 'My Program Coordinator and team supported me.' },
      { id: 'clear', text: 'The policies and expectations are clear.' },
      { id: 'overall', text: 'Overall, I am glad I joined Evergreen.' },
    ],
  },
  first_week: {
    title: 'Your first week', audience: 'New staff (first week)', coa: 'HR · TS',
    intro: 'A quick check after your first week. Only the directors see the results.',
    questions: [
      { id: 'orientation', text: 'My orientation was clear and well organized.' },
      { id: 'ready', text: 'I felt ready for my first shift.' },
      { id: 'safe', text: 'I feel safe at work.', yesno: true },
      { id: 'welcome', text: 'My team made me feel welcome.' },
      { id: 'know_who', text: 'I know who to ask when I need help.' },
    ],
  },
  applicant: {
    title: 'Your application experience', audience: 'Job applicants', coa: 'HR',
    intro: 'Thank you for applying to Evergreen Community Care. Tell us how the hiring process went for you.',
    questions: [
      { id: 'clear', text: 'The application steps were clear and easy to follow.' },
      { id: 'respect', text: 'I was treated with respect throughout the process.' },
      { id: 'timely', text: 'Evergreen kept me informed and responded in good time.' },
      { id: 'overall', text: 'Overall, I had a good experience applying.' },
    ],
  },
  referral: {
    title: 'Referral and intake experience', audience: 'Referral sources (intake)', coa: 'PQI · GLS',
    intro: 'Tell us how the referral and intake process with Evergreen went.',
    questions: [
      { id: 'timely', text: 'Evergreen responded to the referral quickly.' },
      { id: 'clear', text: 'The intake forms and steps were clear.' },
      { id: 'communication', text: 'I was kept informed about the decision and the move-in plan.' },
      { id: 'overall', text: 'Overall, I am satisfied with the intake process.' },
    ],
  },
};
export const SURVEY_KEYS = Object.keys(SURVEYS);
export const STAFF_ONLY = new Set(['staff', 'new_hire', 'first_week', 'applicant']); // results seen by directors only

// When resident surveys go out: a 30-day "settling in" check, 3 and 6 months after admission, then every 6 months,
// and at discharge. (The 30-day check is handled in lib/surveyJob.js.)
export const NO_REPEAT_DAYS = 30; // automatic surveys: at most one per person every 30 days
export function residentMilestone(admission, today) {
  if (!admission) return null;
  const a = new Date(admission + 'T12:00:00Z'), t = new Date(today + 'T12:00:00Z');
  const months = (t.getUTCFullYear() - a.getUTCFullYear()) * 12 + (t.getUTCMonth() - a.getUTCMonth()) - (t.getUTCDate() < a.getUTCDate() ? 1 : 0);
  if (months < 3) return null;
  if (months < 6) return { months: 3, label: '3-month' };
  const m = Math.floor(months / 6) * 6;
  return { months: m, label: `${m}-month` };
}

// Score one set of answers: average of the 1–5 answers (yes = 5, no = 1). Concern if any safety "no" or average < 3.
export function scoreAnswers(key, answers) {
  const qs = SURVEYS[key]?.questions ?? [];
  const vals = [];
  let concern = false;
  for (const q of qs) {
    const v = answers?.[q.id];
    if (q.yesno) { if (v === 'yes') vals.push(5); else if (v === 'no') { vals.push(1); concern = true; } }
    else if (Number.isInteger(v) && v >= 1 && v <= 5) vals.push(v);
  }
  const score = vals.length ? Math.round((100 * vals.reduce((a, b) => a + b, 0)) / vals.length) / 100 : null;
  if (score !== null && score < 3) concern = true;
  return { score, concern };
}

// Keep only known questions and allowed values.
export function cleanAnswers(key, raw) {
  const out = {};
  for (const q of SURVEYS[key]?.questions ?? []) {
    const v = raw?.[q.id];
    if (q.yesno) { if (v === 'yes' || v === 'no') out[q.id] = v; }
    else { const n = Number(v); if (Number.isInteger(n) && n >= 1 && n <= 5) out[q.id] = n; }
  }
  return out;
}
