// 🔍 Find: the everyday words for each page, and step-by-step "How do I…?" answers.
// Used by the Find box (app/components/FindBox.js) and by Ask Evergreen (lib/ask.js helpChunks).
// A page or a how-to only shows for someone who can open that page: results come from their own menu.
// To add words: put them next to the page's address below. To see what people searched for and did not find:
// Quality → Searches with no result (/qa/find-misses).

// A page address with ids removed, so one entry covers every house or person: /homes/<id>?tab=safety -> /homes/*?tab=safety
export const normHref = (href) => String(href ?? '')
  .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/*');

// Everyday words people type for each page.
export const PAGE_WORDS = {
  '/id#checkin': 'clock in out punch start shift end shift time clock arrive leave check in sign in sign out location',
  '/checklist': 'shift checklist duties tasks chores tick sign end of shift cleaning',
  '/notes': 'daily notes write note log charting progress notes documentation shift note',
  '/document': 'documentation document records sections day book wellness check daily grid behaviour health check service record',
  '/todo': 'to do tasks due overdue my list what do I need to do',
  '/notifications': 'alerts inbox messages notifications bell',
  '/absence?kind=Sick&pay=bc': 'sick ill unwell not feeling well call in',
  '/absence?kind=Family%20emergency&pay=other': 'family emergency urgent leave',
  '/absence': 'sick call in late running late cannot come absent family emergency no show call out',
  '/id': 'id card badge photo selfie identification verify',
  '/sign': 'documents to sign signature e-sign esign send for signature sign request signed contract form',
  '/suggest': 'suggestion idea feedback improvement complaint box',
  '/academy': 'courses training videos quiz certificate learning lessons e-learning academy orientation course',
  '/academy/plan': '90 day plan training plan due courses required training',
  '/academy/videos': 'upload video course video versions replace video',
  '/ask': 'ask policy question help chatbot AI what does the policy say',
  '/homes/*?tab=residents': 'residents clients youth adults individuals person profile file care plan medication MAR meds incident report goals consents money allowance',
  '/missing': 'missing youth runaway run ran away AWOL absent without leave police missing person protocol kid child gone left did not come home not back curfew',
  '/calendar': 'appointments calendar doctor dentist visits court family visit book appointment',
  '/residents/new': 'add resident new placement admission move in new client new youth new adult',
  '/homes': 'houses homes residences all houses list staff in house directory contacts social worker phone numbers',
  '/homes/*?tab=dashboard': 'my house dashboard overview staff in this house directory contacts job and offer letter',
  '/homes/*?tab=commbook': 'shift log comm book communication book handover hand over message next shift',
  '/homes/*?tab=safety': 'fire drill safety check evacuation monthly inspection home safety smoke alarm extinguisher',
  '/homes/*/inventory': 'inventory equipment assets serial number furniture phone laptop tablet register lost item',
  '/action-items': 'problems to fix action items corrective action hazards open issues follow up overdue',
  '/records': 'missing details gaps incomplete records missing information empty fields',
  '/approvals': 'approvals approve permission clock in request sos emergency alert waiting for me',
  '/checkins': 'staff on shift now who is working right now today clocked in location on duty',
  '/schedule': 'schedule calendar shifts roster rota who works when',
  '/schedule?tab=mine': 'my schedule my shifts six months phone calendar when do I work',
  '/schedule?tab=open': 'open shifts pick up swap trade cover extra shift give away shift',
  '/schedule?tab=timeoff': 'time off vacation holiday leave request day off book vacation',
  '/schedule?tab=teams': 'staffing lines assign staff team full-time part-time weekend partner ratio 1 or 2 staff who is on which line',
  '/attendance': 'attendance sick days late arrivals who is in absent BC sick day balance',
  '/timesheet': 'timesheet hours payroll pay approve hours worked overtime my hours',
  '/intake': 'referrals intake new placement referral MCFD CLBC request bed available',
  '/launch': 'opening a new house launch plan pre-opening before opening requirements new residence residential site visit transition in milestones documents needed before opening checklist environment of care',
  '/kpi': 'KPI scorecard performance how are we doing compliance numbers statistics',
  '/reports/daily': 'print report documentation PDF funder social worker daily report date range export',
  '/hr': 'staff files HR employees personnel staff list certificates criminal record check CRC first aid training records hire date',
  '/hr/*': 'my HR file my certificates my documents my training',
  '/hr/prescreen': 'job applicants prescreen pre-screening hiring candidates references interview application recruit reference check',
  '/onboarding': 'onboarding paperwork new hire forms signature direct deposit personal information emergency contact',
  '/probation': 'probation reviews 30 90 120 days first 90 days new hire review confirm full-time',
  '/badges': 'badges performance green yellow red monthly rating bonus letter of expectation',
  '/policies': 'policies handbook manual rules procedures read and sign code of conduct',
  '/careers': 'career promotion perks ladder raise step up benefits',
  '/hr/pay-rates': 'pay rates wage salary hourly rate pay grid how much do we pay',
  '/qa/safety': 'safety across houses drills checks all houses',
  '/help': 'help rules laws questions guide FAQ how does this work',
  '/review': 'monthly QA review quality review house review due the 10th',
  '/qa': 'COA accreditation standards evidence quality assurance',
  '/qa/surveys': 'surveys feedback satisfaction questionnaire',
  '/qa/suggestions': 'staff suggestions answer ideas reply',
  '/qa/audits': 'file audits resident file audit check files',
  '/qa/find-misses': 'searches with no result what people looked for find box',
  '/admin/audit': 'audit log security log who changed what history tracking deleted record',
  '/admin/access': 'access departments give access permissions new user account login invite add staff member',
  '/admin/security': 'security settings who can see sections permissions hide section',
  '/admin': 'admin users settings add person turn off access add house storage',
  '/policies/records': 'policy sign off records signature witness signed copy who has not signed unsigned late 14 days audit print signed policy',
  '/admin/import-policies': 'import policies upload policy manual',
  '/orientation': 'my orientation plan six day first week new staff',
  '/orientation/team': 'team orientation sign off new staff orientation progress complete orientation',
  '/dashboard': 'overview dashboard all houses summary',
};

// "How do I…?" answers. `go` lists the pages that start the task, best first: the first one this person
// can open is used, and the how-to is hidden if they can open none of them.
const H = (q, words, go, steps) => ({ q, words, go: [].concat(go), steps });
const HOUSE = ['/homes/*?tab=dashboard', '/homes'];
export const HOWTOS = [
  H('Send a new hire their offer letter', 'offer letter hire job contract employment full-time part-time hours new staff', HOUSE, [
    'Open the house page.', 'Scroll to “Staff in this house”.', 'Beside the person’s name, click “📄 Job and offer letter”.',
    'Choose the position, full-time or part-time, hours each week and the start date.', 'Click “Save and send the offer letter”. They get it in the portal to sign.']),
  H('Upload our own offer letter file', 'upload offer letter version file own letter PDF Word', HOUSE, [
    'Open the house page and click “📄 Job and offer letter” beside the person’s name.', 'Scroll to “Uploaded offer letters”.',
    'Add a note if you want, then choose the PDF or Word file.', 'It is saved as the next version. Older versions are kept.']),
  H('Set or change a pay rate', 'pay rate wage hourly salary change pay', '/hr/pay-rates', [
    'Open HR & People → 💲 Pay rates.', 'Type the hourly rate beside the position and click Save.',
    'Any offer letter that was waiting for that rate is sent automatically.', 'Only the Executive Director, CSO, CEO and Administrator can change a rate.']),
  H('Record a fire drill or the monthly safety check', 'fire drill safety check evacuation monthly record', '/homes/*?tab=safety', [
    'Open your house page and choose the fire drill and safety tab.', 'Click “Record a fire drill” (or the safety check) and fill in the form.', 'Save. It counts for this month.']),
  H('Report an incident', 'incident report critical reportable injury restraint behaviour police', '/homes/*?tab=residents', [
    'Open Residents and click the person.', 'Go to the Incidents part of their file.', 'Fill in what happened: facts, times, who was there, what you did. Save before the end of your shift.',
    'If anyone is in danger, use the red 🆘 button or call 911 first.']),
  H('Give or record medication', 'medication meds MAR dose pill give record refused', '/homes/*?tab=residents', [
    'Open Residents and click the person.', 'Go to Medications in their file.', 'Record each dose at the time it is given: Yes or No, with the reason if not given.']),
  H('Report a missing youth', 'missing youth runaway ran away AWOL not home police kid child gone left curfew', '/missing', [
    'If there is immediate danger, call 911 first.', 'Open Missing youth and start the protocol.', 'Follow the timed steps on the screen. The log starts from the first minute.']),
  H('Call in sick or say I am running late', 'sick late cannot make shift call in absent emergency', '/absence', [
    'Open “Sick / can’t make my shift”.', 'Choose sick, running late or family emergency, pick the shift and send.', 'Your leaders are told right away. Do this at least 4 hours before your shift when you can.']),
  H('Clock in or clock out', 'clock in out punch start end shift', '/id#checkin', [
    'Click the green “⏰ Clock in / out” button at the top of any page.', 'Choose the house and press Clock in. Allow location when your phone asks.',
    'To leave, complete “Before you leave” and press Clock out.']),
  H('Ask for time off or vacation', 'time off vacation holiday leave request day off', '/schedule?tab=timeoff', [
    'Open Schedule → Time off.', 'Choose the dates and the reason, then send.', 'It goes up the approval chain. Vacation is approved once the vacant shifts are filled.']),
  H('Pick up or swap a shift', 'pick up swap trade cover extra open shift', '/schedule?tab=open', [
    'Open Schedule → Open shifts & swaps.', 'Pick up an open shift, or offer one of yours.', 'An open shift is yours straight away. An offered shift needs the Program Coordinator’s OK.']),
  H('Approve staff hours (timesheets)', 'approve hours timesheet payroll fix hours', '/timesheet', [
    'Open Timesheets.', 'Check each person’s hours for the pay period.', 'Approve them, or fix an entry with a note.']),
  H('Approve a clock-in or clock-out request', 'approve permission request clock in away from house waiting', '/approvals', [
    'Open Approvals.', 'Read the reason the staff member gave.', 'Approve or decline. They get an alert.']),
  H('Add a new staff member and give them access', 'add new staff user account login invite give access hire', ['/admin', '/admin/access'], [
    'Open Admin (or Access & departments).', 'Enter their full name and email or cell, and choose their access level and house.', 'Save. They sign in with a code sent to that email or phone.']),
  H('Add a new resident', 'add resident new placement admission move in', '/residents/new', [
    'Open Individuals → Add a resident.', 'Fill in their details and house, then save.', 'Their file opens with the requirements for their program (MCFD or CLBC).']),
  H('Find what must be done before opening a house', 'pre-opening before opening requirements new house residence launch checklist documents', '/launch', [
    'Open Programs → 🚀 Opening a new house.', 'Open the plan for that house.', 'Use the three tabs: Milestones, Documents before opening, and Plan details.']),
  H('Sign off a new staff member’s orientation', 'orientation sign off new staff complete day 5 day 6', '/orientation/team', [
    'Open Team orientation and choose the person.', 'Tick the in-person steps as they are done.',
    'On the last day, press Sign off on “Program Coordinator sign-off”. Their certificate and the Board’s welcome message are issued.']),
  H('Do a 30, 90 or 120-day probation review', 'probation review 30 90 120 new hire confirm full-time', '/probation', [
    'Open First-90-days reviews.', 'Choose the review that is due and fill it in with the staff member.', 'The 120-day review is done by a Program Manager, who confirms, extends or ends probation.']),
  H('Send a document for signature', 'send document signature sign request e-sign upload PDF', '/sign', [
    'Open Documents to sign.', 'Click “+ Send a document for signature”.', 'Upload the file, choose who signs and send. You can follow who has signed.']),
  H('Print a report for a social worker or funder', 'print report PDF social worker funder documentation date range', '/reports/daily', [
    'Open Print documentation.', 'Choose the house or person and the dates.', 'Print, or choose “Save as PDF”. Only Program Coordinators and above can print.']),
  H('Add a certificate or training record to a staff file', 'certificate CRC criminal record first aid NVCI training expiry upload', '/hr', [
    'Open Staff files and click the person.', 'Use “Add a certificate” or “Add training”.', 'Enter the dates and upload the file. Expiry reminders start automatically.']),
  H('Write a daily note', 'daily note write shift note log documentation', '/notes', [
    'Open Daily notes.', 'Write a note for each person: factual, respectful, in plain words.', 'Sign it before you leave your shift.']),
  H('Do my shift checklist', 'shift checklist duties tick sign', '/checklist', [
    'Open My shift checklist.', 'Tick each duty as you do it.', 'Sign the checklist before you clock out.']),
  H('Read and sign a policy', 'policy read sign handbook acknowledge', '/policies', [
    'Open Policies.', 'Open the policy and read it.', 'Sign at the bottom. The signed copy goes to your staff file and the policy is then locked. Read it again in the binder in your house.']),
  H('Print a policy with the signature on it', 'print signed policy signature copy printout paper', '/policies/records', [
    'HR, directors and the Administrator: open Policy sign-off records and open the person’s record.', 'Click “Open” beside the policy. It opens with the signature on the last page. Print it or save it.', 'Everyone else: signed policies are locked after signing. Read the policy in the binder in your house, or ask HR for your copy.']),
  H('Download all of one staff member’s signed policies', 'download all signed policies one file zip compressed investigation audit full policy file export', '/policies/records', [
    'HR, directors and the Administrator: open Policy sign-off records and open the person’s record.', 'Under “Full policy file”, click “Download as one ZIP file” or “Download as one PDF”.', 'The file has the witness record and every signed policy. Each download is written to the security audit log.']),
  H('Witness a staff member’s signed policies', 'witness review policy sign off record coordinator manager signature check', '/policies/records', [
    'Open Policy sign-off records.', 'Under “Waiting for a witness”, open the person’s record and open each signed copy.', 'Tick the box, type your name, draw your signature and click “Sign as witness”.']),
  H('See who has not signed their policies', 'who has not signed unsigned policies late overdue 14 days', '/policies/records', [
    'Open Policy sign-off records.', 'Look under “Still to sign”. Late ones are marked in red.', 'Staff have 14 days. After that the Program Coordinator and Program Manager are told.']),
  H('Take a training course', 'course training video quiz certificate academy', '/academy', [
    'Open Evergreen Academy.', 'Open the course, watch the video to the end, then take the quiz.', 'When you pass, the certificate is saved in your file.']),
  H('See who is on shift right now', 'who is working on shift now clocked in on duty', '/checkins', [
    'Open Staff on shift now.', 'Each house shows who is clocked in and their last check-in.']),
  H('See who changed a record', 'audit log who changed deleted history security', '/admin/audit', [
    'Open Security audit log.', 'Choose the area, the person or the dates and click Show.', 'Open “fields changed” to see the old and new values.']),
  H('Screen a job applicant and check references', 'applicant prescreen screening references interview hiring candidate', '/hr/prescreen', [
    'Open Job applicants.', 'Open the applicant’s file.', 'Record the interview, reference checks and screening items. Reference forms are emailed automatically.']),
  H('Add or update equipment in the inventory', 'inventory equipment item serial phone laptop lost stored', '/homes/*/inventory', [
    'Open your house → Inventory register.', 'Add the item with its serial number and a photo.', 'Mark items in use, stored, lost or retired with a reason.']),
  H('Set a staff member’s monthly badge', 'badge green yellow red monthly performance', '/badges', [
    'Open Badges.', 'Choose the person and the month, pick the colour and add a short reason.', 'Click Save badge.']),
  H('Do the monthly quality review for my house', 'monthly QA review quality house review due 10th', '/review', [
    'Open Monthly QA review.', 'Answer each line for your house.', 'Submit it by the 10th.']),
  H('Leave a message for the next shift', 'handover hand over message next shift comm book shift log', '/homes/*?tab=commbook', [
    'Open your house → Shift log & comm book.', 'Write what the next shift needs to know and save.']),
  H('Book an appointment for a resident', 'appointment doctor dentist book calendar visit', '/calendar', [
    'Open Calendar.', 'Add the appointment with the date, time and person.', 'It shows on the house calendar for every shift.']),
  H('Change who can see a section of the CRM', 'security permissions who can see section hide access', '/admin/security', [
    'Open Admin → 🔒 Security settings.', 'Find the section and the role, and choose the level.', 'The menu and the database rules change together. Only the Administrator can do this.']),
  H('Fix a problem that was flagged', 'problem fix action item corrective overdue hazard', '/action-items', [
    'Open Problems to fix.', 'Open the item, do the work and add your evidence.', 'Someone else approves it, then it closes.']),
  H('Send a suggestion to leadership', 'suggestion idea feedback improve', '/suggest', [
    'Click the suggestion button at the top of any page, or open My suggestions.', 'Write your idea and send.', 'You will see the answer in My suggestions.']),
];

// ---------- Matching ----------
const STOP = new Set(('a an the i we you my our me us is are was do does did can could should would will to of for in on at it this that these those with and or '
  + 'how where what when which who find see show get go need want have has there here please page pages screen menu section thing things '
  + 'looking look locate open click').split(' '));
const stem = (w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);
export const wordsOf = (text) => String(text ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const keyTerms = (q) => { const all = wordsOf(q); const k = all.filter((w) => !STOP.has(w)); return (k.length ? k : []).map(stem); };

function score(terms, fields) {
  // fields: [[text, weight]]. Returns { hit: terms matched, pts } or null.
  let hit = 0, pts = 0;
  const sets = fields.map(([t, w]) => [wordsOf(t).map(stem), w]);
  for (const term of terms) {
    let best = 0;
    for (const [ws, w] of sets) {
      if (ws.includes(term)) best = Math.max(best, w * 2);
      else if (term.length >= 3 && ws.some((x) => x.startsWith(term) || (x.length >= 4 && term.startsWith(x)))) best = Math.max(best, w);
    }
    if (best) { hit++; pts += best; }
  }
  return hit ? { hit, pts } : null;
}

// items: the pages this person can open ({ label, href, icon, where, sub?, via? }).
// Returns { pages, howtos, terms }: the best matches, pages first by how many of the words they match.
export function searchFind(q, items) {
  const terms = keyTerms(q);
  if (!terms.length) return { pages: [], howtos: [], terms };
  const full = terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.6);
  const rank = (x, y) => y.s.hit - x.s.hit || y.s.pts - x.s.pts;

  const seen = new Set();
  const pagesAll = [];
  for (const it of items ?? []) {
    if (seen.has(it.href)) continue;
    const s = score(terms, [[it.label, 3], [PAGE_WORDS[normHref(it.href)] ?? '', 2], [`${it.where ?? ''} ${it.sub ?? ''}`, 1]]);
    if (!s) continue;
    seen.add(it.href);
    pagesAll.push({ ...it, s });
  }

  const byNorm = new Map();
  for (const it of items ?? []) { const n = normHref(it.href); if (!byNorm.has(n)) byNorm.set(n, it); }
  const howAll = [];
  for (const h of HOWTOS) {
    const target = h.go.map((g) => byNorm.get(g)).find(Boolean);
    if (!target) continue;
    const s = score(terms, [[h.q, 3], [h.words, 2]]);
    if (s) howAll.push({ q: h.q, steps: h.steps, href: target.href, label: target.label, icon: target.icon, s });
  }

  // Most of the words must match. If nothing does, accept fewer (down to one word) rather than show nothing.
  for (let need = full; need >= 1; need--) {
    const pages = pagesAll.filter((x) => x.s.hit >= need).sort(rank);
    const howtos = howAll.filter((x) => x.s.hit >= need).sort(rank);
    if (pages.length || howtos.length) return { pages: pages.slice(0, 6), howtos: howtos.slice(0, 3), terms };
  }
  return { pages: [], howtos: [], terms };
}

// Where a page sits in the menu, in words.
export const whereOf = (it) => (it.via === 'sec' ? (it.where === 'Sections' ? 'All sections' : `All sections → ${it.where}`) : it.where ? `Home → ${it.where}` : 'Home');
