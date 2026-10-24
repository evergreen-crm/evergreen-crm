// Step 8 — the ❓ Help button: short, plain-words help for the page you're on.
// Matched by the start of the web address; the longest match wins.
export const PAGE_HELP = [
  { path: '/', title: 'Home', tips: [
    'Your home page shows what matters for your shift or your job today.',
    '✅ To-do (top bar) lists everything you need to do. It clears itself when the work is done.',
    '🔔 shows your alerts. Tap one to open it.',
    'In an emergency, tap 🆘 (bottom right) — it calls 911 or on-call and alerts your leaders.'] },
  { path: '/portal', title: 'Portal', tips: [
    'The portal has every part of the CRM. Tap a tile to open it.',
    'Frontline staff: start with “Clock in”, then your Shift checklist and Daily notes.'] },
  { path: '/todo', title: 'My to-do', tips: [
    'Everything you need to do, sorted: Overdue, Today, This week, Later.',
    'Tap an item to go straight to where you do it. It disappears by itself once it’s done.',
    'Red items are overdue — do those first.'] },
  { path: '/id', title: 'My ID card and clock in / out', tips: [
    'Clock in: choose your house and tap ▶ Clock in. You must be at the house (within about 100 m).',
    'Not at the house (for example at the hospital with a youth)? You’ll be asked why; your Program Coordinator or Manager approves it.',
    '🛡 Before you leave opens 30 minutes before your shift ends: sign your checklist and daily notes, answer the safety questions, then tap Clock out.',
    'Location is only checked when you tap a button — never in the background.'] },
  { path: '/checklist', title: 'Shift checklist', tips: [
    'Tick each duty as Done, N/A (with a reason) or Problem (with what happened).',
    '⭐ Safety items can’t be N/A. If something is wrong, choose Problem — your leaders get an alert.',
    'Sign the checklist before you clock out. Once signed it’s locked.'] },
  { path: '/notes', title: 'Daily notes', tips: [
    'Write one note per youth / person for your shift: mood, meals, activities and what happened.',
    'Write facts (what you saw and heard), not opinions. Use their words in quotes.',
    'A note isn’t finished until you tap Sign. You can edit it until your Program Coordinator signs it off.'] },
  { path: '/residents', title: 'Youth and adults', tips: [
    'Open a person to see their alerts, notes, medications (MAR), goals and documents.',
    'Always read the alerts at the top before your shift.',
    'Something serious happened? Use the Incidents tab, and tell on-call right away.'] },
  { path: '/approvals', title: 'Approvals and 🆘', tips: [
    'Open emergencies are at the top — check in with the staff member, then tap Mark handled.',
    'Clock in / out requests: read the reason, then Approve or Decline. The staff member gets an alert.',
    'Check-outs from the last 3 days show who handed over to whom and any injuries.'] },
  { path: '/reports/daily', title: 'Print documentation', tips: [
    'Choose a house (or one person), the dates, and what to include, then tap Show report.',
    'Tap 🖨 Print / Save as PDF. To make a PDF, choose “Save as PDF” as the printer.',
    'Program Coordinators can print their own house. Program Managers and up can print any house.',
    'Every report you open or print is recorded (who, what and when). Each page says CONFIDENTIAL.',
    '“Late entry” means it was written more than a day after the date it is about.'] },
  { path: '/hr/', title: 'Staff file', tips: [
    'This is one staff member’s HR record: details, onboarding, certificates and training.',
    '🗂 Print complete staff file puts everything from hire to exit in one printout (or “Save as PDF”).',
    'Only HR and Program Managers and up can print staff files. Every print is recorded.'] },
  { path: '/sign', title: 'Documents to sign', tips: [
    'Waiting for my signature: open each one, read it, tick “I have read it”, type your name and draw your signature.',
    'If you don’t agree, tap “I won’t sign this” and say why — it goes to the person who sent it.',
    'If the sender put yellow boxes on the document for you, fill each one in; your signature, name and the date fill in by themselves.',
    'Program Coordinators, Program Managers and Directors can send documents: tap “Send a document for signature”. You can also send to anyone outside Evergreen (a social worker, doctor, parent…) by email.',
    'On a PDF, tap “Place boxes on the document”, pick the person and the kind of box, then click on the page where it goes.',
    'Each request belongs to a house: coordinators and managers see their own house; the CSO, CEO and Admin see every house.',
    'When everyone has answered you get one finished PDF with every box filled in and a signing certificate. Outside signers are emailed a copy.'] },
  { path: '/records', title: 'Missing details', tips: [
    'Shows staff, house and youth/adult records with details missing.',
    'Fill them in within 1 week. After 1 week they go to the Director of Operations; after 1 month to the ED and CEO.',
    'Tap ✏️ Fill in to add what’s missing. Items close by themselves once they’re done.'] },
  { path: '/schedule', title: 'Schedule', tips: [
    'You stay on one shift (Day, Evening or Awake night) with a weekend partner. Everyone gets every other weekend off. The pattern repeats every 2 weeks and is posted 6 months ahead.',
    'My shifts: your shifts, offer a shift you can’t work, and protect up to 2 family days a month (book 7+ days ahead).',
    'Open shifts: pick up extra shifts (part-timers up to 36 h a week). Swaps need your Program Coordinator’s OK.',
    'Time off: ask for vacation or leave. Once approved, your shifts become open shifts for others.',
    'Tap “📋 How we decide who works…” for the rules on full-time, part-time and which shift you get.'] },
  { path: '/timesheet', title: 'My hours', tips: [
    'Your clock-in and clock-out times. Clock in and out from your ID card (🪪), not here.',
    'Something wrong? Ask your Program Coordinator to fix it before payroll.'] },
  { path: '/homes', title: 'Houses', tips: [
    'Each house has its residents, calendar, safety records and settings.',
    'Program Managers: tap Edit house to set the map location, house phone and on-call phone.'] },
  { path: '/hr', title: 'HR', tips: [
    'Staff files: details, certificates, training, onboarding and employment status.',
    'Certificates show red when expired and yellow when they expire within 30 days.',
    'Reminders go to the staff member and their Program Coordinator and Manager 30 days and 7 days before something expires.',
    'Expired or missing criminal record check, First Aid or NVCI = not cleared to work: they can’t be given shifts, and shifts in the next 7 days become open shifts until the new certificate is uploaded.'] },
  { path: '/academy', title: 'Evergreen Academy', tips: [
    'Your training courses. Watch the video, then pass the short quiz.',
    'Your 90-day training plan shows what’s due and when.'] },
  { path: '/notifications', title: 'Alerts', tips: [
    'Tap an alert to open it. Urgent ones (🆘, injuries, safety problems, requests) are also emailed to you.',
    'Other unread alerts are emailed once a day at about 7 am.'] },
  { path: '/policies', title: 'Policies', tips: [
    'Read each policy and tap “I have read this”. New versions need to be signed again.'] },
  { path: '/action-items', title: 'Problems to fix', tips: [
    'Each problem has an owner and a due date. Fix it, then submit what you did so a manager can close it.'] },
  { path: '/kpi', title: 'How we’re doing', tips: [
    'Green = on target, yellow = needs attention, red = act now. Tap a number to see what’s behind it.'] },
  { path: '/probation', title: 'First 90 days', tips: [
    'Reviews at 30, 90 and 120 days. Read your review and tap “I have read and discussed this review”.'] },
  { path: '/missing', title: 'Missing youth or adult', tips: [
    'Danger or higher risk? Call 911 first. Then tap 🔎 Report missing (on the person’s page or here). It alerts the Program Coordinator and Program Manager and starts the timer.',
    'Tick each step as you do it, at the same time as searching. Add sightings and notes. The CRM reminds leaders at 30 minutes, 1 hour and 2 hours.',
    'Use “Print for police” for the information sheet. When they’re back, tap ✅ Mark as back, then do the return steps. A Program Coordinator or Manager writes the debrief and closes the log.'] },
  { path: '/dashboard', title: 'Overview', tips: [
    'Everything that needs attention today, across the houses you can see.',
    'Tap any number or line to go to where you fix it.'] },
  { path: '/calendar', title: 'Calendar', tips: [
    'Appointments, visits and events by house. Tap a day to see or add one.',
    'Check the calendar at the start of every shift so nothing is missed.'] },
  { path: '/onboarding', title: 'My onboarding', tips: [
    'Your new-staff checklist: documents, training and sign-offs. Finish each item by its due date.'] },
  { path: '/careers', title: 'Career & perks', tips: [
    'See the career ladder, staff perks and your next step. You can ask for a promotion review here.'] },
  { path: '/badges', title: 'Performance badges', tips: [
    '🟢 on track, 🟡 needs attention, 🔴 action needed. Your badge is set each month by your leaders. Nobody sets their own.',
    'Tap your badge to see why, and what helps you move up.'] },
  { path: '/install', title: 'Get the app', tips: [
    'Put Evergreen on your phone’s home screen so it opens like an app. Follow the steps for iPhone or Android.'] },
  { path: '/intake', title: 'New referrals', tips: [
    'Managers: start an intake and email MCFD or CLBC forms. People fill them in and sign online without an account.'] },
  { path: '/launch', title: 'Opening a new house', tips: [
    'The MCFD SHSS transition-in plan for each new house, and how ready it is to open.'] },
  { path: '/hr/prescreen', title: 'Job applicants', tips: [
    'Each applicant’s screening file with GREEN, YELLOW or RED clearance. Nobody starts work before GREEN.'] },
  { path: '/checkins', title: 'Staff on shift', tips: [
    'Who is on shift now, when they last checked in, and each check-in’s location for the day.'] },
  { path: '/admin', title: 'Admin', tips: [
    'Give people access, turn access off, and add houses and residents.'] },
  { path: '/words', title: 'What does this mean?', tips: [
    'Every short form and word we use (MAR, PC, NVCI, SHSS…), in plain language.'] },
  { path: '/help', title: 'Help', tips: [
    'Ask a question with the form. How-to questions go to your Program Coordinator; problems with the CRM go to the Administrator.',
    'You’ll get an alert (and an email) when someone answers.'] },
];

export function helpFor(pathname = '/') {
  let best = PAGE_HELP[0];
  for (const h of PAGE_HELP) {
    if (h.path === '/') continue;
    if ((pathname === h.path || pathname.startsWith(h.path + '/')) && h.path.length > (best.path === '/' ? 0 : best.path.length)) best = h;
  }
  return best;
}

export const HELP_TOPICS = ['How do I…?', 'Something isn’t working', 'Sign-in or access', 'Other'];

export const FAQ = [
  { q: 'I forgot to clock out.', a: 'Tell your Program Coordinator right away. They can fix your time on the timesheet.' },
  { q: 'Clock in says I’m not at the house.', a: 'Step outside or near a window and try again (phones can be 20–60 m off indoors). If you really are away from the house, give the reason and send the request.' },
  { q: 'The location prompt doesn’t appear.', a: 'Allow location for this site in your phone settings (Settings → Safari or Chrome → Location → Allow), then try again.' },
  { q: 'I can’t sign my daily note.', a: 'Every box with ⭐ must be filled in. Scroll up — the empty one is outlined in red.' },
  { q: 'I didn’t get the sign-in code.', a: 'Check your junk / spam folder. Codes expire after a few minutes, so ask for a new one. Still nothing? Ask for help with “Sign-in or access”.' },
  { q: 'Who do I call in an emergency?', a: 'Call 911 if anyone is in danger. Then use the 🆘 button — it calls on-call and alerts your Program Coordinator and Managers with your location.' },
  { q: 'I think a youth is being abused or neglected.', a: 'If they’re in danger now, call 911. Then call 1-800-663-9122 (24/7) yourself. It’s the law, and telling your Program Coordinator doesn’t replace your own report. Then tell on-call and write an incident report. See “Rules and laws we follow”.' },
  { q: 'A youth hasn’t come home.', a: 'Tap 🔎 Report missing on their page (call 911 first if they’re at higher risk). Search the house and area, call and text them, and call friends and family. Call police right away if they’re at higher risk or in danger. Tell on-call and their social worker, with the police file number. See “When a youth is missing”.' },
  { q: 'I can’t work my shift.', a: 'On the Schedule page, open My shifts and tap “Offer to a coworker” on that shift, or use “Ask for time off”. You keep the shift until someone takes it and your Program Coordinator approves. For sickness on the day, call on-call as early as you can.' },
  { q: 'I want more hours.', a: 'Open Schedule → Open shifts and tap Pick up. Part-timers can go up to 36 h a week. The CRM checks your rest time for you.' },
  { q: 'How do I keep a day free for my family?', a: 'Schedule → My shifts → choose the date → “Protect this day”. You can protect up to 2 days a month, booked at least 7 days ahead. You won’t be asked to pick up shifts that day.' },
];

// 📚 Help topics: step-by-step answers grouped by subject. Shown on the Help page.
export const HELP_GUIDES = [
  { icon: '🕐', title: 'Shifts, clock in and clock out', items: [
    ['Before your shift', 'Read the alerts on each youth or adult, the house calendar and the last shift’s notes.'],
    ['Clock in', 'Open 🪪 My ID card, choose your house and tap ▶ Clock in. You must be at the house.'],
    ['During your shift', 'Tick your shift checklist as you go and write daily notes. Something serious? Incident report and on-call, right away.'],
    ['Before you leave', '30 minutes before the end: sign the checklist and notes, answer the safety questions, hand over to the next staff, then Clock out.'],
  ] },
  { icon: '📝', title: 'Daily notes and incident reports', items: [
    ['What to write', 'Facts: what you saw and heard, times, who was there. Use the person’s own words in quotes. No opinions or labels.'],
    ['When', 'During or right after your shift. Never from memory days later.'],
    ['Incidents', 'Use the Incidents tab on the person’s page. Youth: the social worker must be told right away and MCFD gets a form within 24 hours. Adults: urgent incidents go to CLBC right away, with the form within 24 hours.'],
    ['Signing', 'A note isn’t finished until you tap Sign. Once your Program Coordinator signs it off, it’s locked.'],
  ] },
  { icon: '📅', title: 'Schedule, time off and extra shifts', items: [
    ['Your pattern', 'One shift type, one weekend partner, every other weekend off. Same 2-week pattern, posted 6 months ahead.'],
    ['Extra shifts', 'Schedule → Open shifts → Pick up. Up to 36 h a week. At least 11 hours’ rest between shifts and no more than 5 in a row.'],
    ['Time off', 'Schedule → Time off. Ask as early as you can. You’ll get an alert when it’s decided.'],
    ['Who gets which shift', 'Staff choose first, then safety, family needs, reliability, seniority, and a draw. See the rules box on the Schedule page.'],
  ] },
  { icon: '🧒', title: 'Youth and adults we support', items: [
    ['Their page', 'Alerts, care plan, daily notes, medications (MAR), goals, documents and incidents.'],
    ['Medication', 'Only what’s on the MAR. Record each dose right away. Errors are incidents.'],
    ['Their rights', 'Youth in care have legal rights (privacy, family contact, culture, complaints…). See “Rules and laws we follow”.'],
    ['Missing details', 'If something is missing from a person’s record (doctor, allergies, emergency contact…), the Program Coordinator gets 1 week to fill it in.'],
  ] },
  { icon: '🎓', title: 'Training, policies and your first 90 days', items: [
    ['Academy', 'Watch each video and pass the short quiz. Your 90-day plan shows what’s due.'],
    ['Policies', 'Read each one and tap “I have read this”. New versions must be signed again.'],
    ['Certificates', 'Keep First Aid, NVCI and others up to date. HR shows red when expired and yellow within 30 days.'],
    ['Reviews', 'At 30, 90 and 120 days. Read yours and confirm you discussed it.'],
  ] },
  { icon: '💵', title: 'Hours and pay', items: [
    ['My hours', 'Your clock-in and clock-out times feed payroll. Check them every pay period.'],
    ['Something wrong?', 'Ask your Program Coordinator to fix it before payroll closes.'],
    ['Awake nights', 'Paid the same as day shifts.'],
    ['Overtime', 'BC law: after 8 hours a day or 40 a week. Extra shifts you pick up stay within 36 h a week.'],
  ] },
  { icon: '🔔', title: 'Alerts, emails and to-do', items: [
    ['✅ To-do', 'Everything you need to do, in order. Items clear themselves when done.'],
    ['🔔 Alerts', 'Urgent ones are emailed right away. The rest come in one email at about 7 am.'],
    ['Leaders', 'Missing details go to you first. After 1 week they go to the Director of Operations, and after 1 month to the ED, CSO and CEO.'],
  ] },
];
