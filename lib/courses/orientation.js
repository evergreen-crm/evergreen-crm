// Evergreen Academy course: New Staff Orientation.
// Content follows the New Youth Worker Orientation Manual (ECC-ORI-2026-001, v1.0, July 2026).
// Slides are the "video" (narrated in the browser); QUESTIONS are the final quiz.
// The answer key is kept on the server only (lib/courses/orientationKey.js).

export const COURSE = {
  key: 'orientation',
  title: 'New Staff Orientation',
  trainingTitle: 'New Staff Orientation (Evergreen Academy course)', // matches TRAINING_MATRIX
  source: 'New Youth Worker Orientation Manual (ECC-ORI-2026-001)',
  passPercent: 80,
  hours: 1,
};

export const SLIDES = [
  {
    icon: '🌲', title: 'Welcome to Evergreen Community Care',
    points: ['The young people in our care have lived through real adversity', 'Your consistent, caring, professional presence matters most', 'The relationship you build is the main intervention', 'When you are unsure — ask'],
    say: 'Welcome to Evergreen Community Care. The young people in our care have lived through real adversity. Your presence — consistent, caring and professional — will matter more to them than any program or procedure. The relationship you build with each young person is itself the main intervention. And whenever you are unsure, ask.',
  },
  {
    icon: '🗓️', title: 'Your first 90 days',
    points: ['Before Day 1: criminal record check, signed offer, policy sign-offs', 'Day 1: orientation, facility tour, emergency procedures, mentor assigned', 'Week 1: at least 3 supervised shifts with your mentor', '30 · 60 · 90 days: training milestones and check-ins', 'Probation reviews at 30, 90 and 120 days — then confirmed full-time'],
    say: 'Your orientation is a structured ninety-day journey. Before day one, your criminal record check, offer letter and policy sign-offs are complete. On day one you get a full orientation, a tour, the emergency procedures, and a mentor. In week one you work at least three supervised shifts. Training milestones follow at thirty, sixty and ninety days. In the Evergreen portal you will have probation reviews at thirty, ninety and one hundred and twenty days, and then you are confirmed full-time. You will never be left on your own before you are ready.',
  },
  {
    icon: '🤝', title: 'Your role: a therapeutic caregiver',
    points: ['Not a babysitter, security guard or caseworker', 'Physical care: meals, clean space, clothing, hygiene support', 'Documentation, school support, community activities', 'Support family contact — never block authorized contact'],
    say: 'A youth care worker at Evergreen is not a babysitter, a security guard, or a caseworker. You are a therapeutic caregiver. That means physical care — good meals, a clean and comfortable space, clothing and hygiene support — plus documentation, school support, community activities, and supporting family connection. Never create barriers to authorized family contact.',
  },
  {
    icon: '🧭', title: 'Professional boundaries',
    points: ['Never share your personal phone, email or social media', 'No social media connections with current or recent youth', 'No gifts of significant value', 'Physical contact: therapeutic, welcomed — ask first, always', 'Disclose any prior relationship with a youth or family'],
    say: 'Boundaries protect young people. They are not a wall — they make a safe relationship possible. Never share your personal phone number, email or social media. Never connect on social media with current or recently discharged youth. Never accept gifts of significant value. Physical contact must be clearly therapeutic, culturally safe and welcomed — ask first, always. And tell your supervisor right away about any prior relationship with a youth or their family.',
  },
  {
    icon: '💚', title: 'Trauma and attachment',
    points: ['Ask “What happened to you?” — not “What’s wrong with you?”', 'Behaviour is communication', 'Youth may test you — that is survival logic, not defiance', 'Your steady, non-retaliating presence is therapeutic'],
    say: 'Almost every young person in care has experienced trauma. Trauma changes how people respond to stress and to relationships. Ask what happened to you, not what is wrong with you. When a youth shouts, throws something or shuts down, they are usually communicating something they cannot say another way. They may test you again and again — that is survival logic, not defiance. Your steady, boundaried, non-retaliating presence over time is truly therapeutic.',
  },
  {
    icon: '⚖️', title: 'Rights of youth in care — CFCSA s.70',
    points: ['Rights are legal entitlements', 'They are never taken away as a consequence or given as a reward', 'Food, clothing, privacy, medical care, culture, religion', 'Private contact with family, lawyer, the Representative for Children and Youth', 'Free from corporal punishment — ever'],
    say: 'Section seventy of the Child, Family and Community Service Act lists the rights of every young person in care. These are legal entitlements. They can never be withheld as a consequence or handed out as a reward. They include being fed, clothed and nurtured, privacy, medical and dental care, their culture and religion, private contact with family, their lawyer and the Representative for Children and Youth, and freedom from corporal punishment — always. You will explain these rights to youth at admission.',
  },
  {
    icon: '📞', title: 'Your duty to report — CFCSA s.14',
    points: ['Report to MCFD immediately when you have reasonable grounds', 'The duty is personal — telling your supervisor is not enough', 'Report even if told in confidence or someone else may have reported', 'Applies even if the concern involves a colleague', 'MCFD Provincial Centralized Screening: 1-800-663-9122 (24 hours)'],
    say: 'Section fourteen requires every person — including you — to report to the Ministry immediately when you have reasonable grounds to believe a child needs protection. This duty is personal and cannot be handed off. Telling your supervisor does not fulfil it — you must report yourself. Report even if the information was shared in confidence, even if you think someone else already reported, and even if the concern involves a colleague or supervisor. The twenty-four hour line is one, eight hundred, six six three, nine one two two.',
  },
  {
    icon: '🚫', title: 'Never — prohibited practices',
    points: ['Corporal punishment', 'Seclusion or locking a youth in any space', 'Withholding meals, bedding or basic needs', 'Humiliation, ridicule or shaming', 'Threatening a placement change to control behaviour', 'Prone (face-down) restraint — under any circumstances'],
    say: 'Some practices are never allowed — no context, urgency or instruction from anyone makes them acceptable. Corporal punishment. Seclusion or confining a youth. Withholding meals, bedding or any basic need. Humiliation, ridicule or shaming. Restricting authorized family contact. Threatening a placement change to control behaviour. Restraint as a punishment, and prone, face-down restraint — under any circumstances. If you are ever told to do any of these, refuse and report.',
  },
  {
    icon: '🔒', title: 'Privacy and confidentiality',
    points: ['Youth information is shared only with those who need it for care', 'Nothing about a youth on social media — not even vaguely', 'No photos of a youth without written MCFD authorization', 'Never confirm a youth is in care to anyone unauthorized', 'Police, media or public → refer to the Program Manager'],
    say: 'Everything about a young person — their name, care status, history, family and gender identity — is confidential. Share it only with people who need it to provide care. Never post about a youth on social media, not even in vague terms. Never photograph a youth without written Ministry authorization. Never confirm or deny to anyone unauthorized that a youth is in care. If police, media or the public ask, refer them to the Program Manager.',
  },
  {
    icon: '🔄', title: 'The shift',
    points: ['Handover: at least 15 minutes, every youth, medications, counts', 'Safety check: exits clear, medication and chemicals locked', 'Wellness checks: every 30 min with a safety plan; hourly for all others', 'Write the shift log for every youth before you leave'],
    say: 'Every shift follows the same structure. A verbal handover of at least fifteen minutes covering every youth, medications given, and outstanding tasks. A safety walkthrough — exits clear, medication cabinet and chemicals locked, every youth accounted for. Wellness checks at least every thirty minutes for youth with safety plans, and at least hourly for everyone else, documented overnight. And before you leave, a shift log for every youth.',
  },
  {
    icon: '🌊', title: 'De-escalation and restraint',
    points: ['Notice early signs — reduce demands, offer space and choices', 'Calm, low voice; call for backup early', 'Restraint only with imminent risk of serious harm', 'Only when NVCI-certified and with a second staff present or called', 'After any restraint: wellness check, supervisor, report within 2 hours'],
    say: 'De-escalation is your most important skill. Watch for early signs — restlessness, pacing, a change in voice — and respond by reducing demands, offering choices and space, and using the youth\'s behaviour support plan. Stay calm and low-voiced, and call for backup early. Physical restraint is a last resort: only when there is an imminent risk of serious harm, less restrictive approaches have failed, you are NVCI certified, and a second staff member is present or called. Every restraint is a critical incident — wellness check, notify your supervisor, and file the report within two hours.',
  },
  {
    icon: '📝', title: 'Documentation: if you didn’t write it down, it didn’t happen',
    points: ['Accurate, objective, specific — facts, not labels', 'Written before you leave — never the next day', 'Complete — even when it reflects badly on you or a colleague', '✗ “Youth was aggressive.”', '✓ “At 19:15 youth threw a plastic cup… no injury… supervisor notified 19:20.”'],
    say: 'The shift log is a legal document that could be read by a court or the Ministry. Every entry must be accurate, objective and specific — facts you saw and heard, not labels. Write it before you leave the building, never the next day. Keep it complete, even when it reflects badly on you or a colleague. Instead of writing youth was aggressive, write what happened: at nineteen fifteen, youth threw a plastic cup at staff during a conversation about phone use; no injury; staff used verbal de-escalation; supervisor notified at nineteen twenty.',
  },
  {
    icon: '🚨', title: 'Critical incidents',
    points: ['Tell your supervisor immediately', 'Category 1 (missing youth, self-harm with injury, restraint, police, hospital): call MCFD within 2 hours + written report within 24 hours', 'Category 2: written report by the end of the next business day', 'Category 3: in the weekly report to the MCFD social worker', 'Can’t reach the social worker? Call 1-800-663-9122'],
    say: 'Report every critical incident to your supervisor immediately. Category one incidents — like a missing youth, self-harm with injury, physical restraint, police contact or hospitalization — need a verbal report to the Ministry within two hours and a written critical incident report within twenty-four hours. Category two needs a written report by the end of the next business day. Category three goes in the weekly report to the social worker. If the social worker is unavailable for a category one incident, call Provincial Centralized Screening right away.',
  },
  {
    icon: '💊', title: 'Medication — the Five Rights',
    points: ['No medication until you are trained AND authorized in writing', 'Right youth · Right medication · Right dose · Right route · Right time', 'Watch the youth take it, then sign the MAR', 'Never pre-sign. Never guess.', 'Any error is a medical situation and a critical incident'],
    say: 'You may not give any medication until you have completed medication administration training and the Program Manager has authorized you in writing. Then, every single dose follows the five rights: the right youth, the right medication, the right dose, the right route, and the right time. Watch the youth take it before you sign the medication record. Never pre-sign and never guess. Any error is an immediate medical situation and a critical incident.',
  },
  {
    icon: '🦺', title: 'Your safety at work',
    points: ['Your rights: to KNOW, to PARTICIPATE, to REFUSE unsafe work', 'Never manage a physical crisis alone — call backup', 'Report every assault on staff within 2 hours — even with no injury', 'Working alone overnight: check in about every 2 hours', 'EFAP and debriefs are there for you'],
    say: 'Under the Workers Compensation Act you have three rights: the right to know about hazards, the right to participate in health and safety, and the right to refuse unsafe work without retaliation. You are never required to manage a physical crisis alone. Report every assault on staff within two hours, even if there was no injury. On solo overnight shifts, keep your check-in device charged and check in with your contact about every two hours. After a difficult incident you will be offered a debrief and the Employee and Family Assistance Program.',
  },
  {
    icon: '🪶', title: 'Cultural safety and gender-affirming care',
    points: ['Actively support every Indigenous youth’s Cultural Plan', 'Elders, ceremony, smudging, traditional foods — without judgment', 'Use every youth’s correct name and pronouns — always', 'Unsure? Ask respectfully and privately', 'Respond to racism or discrimination immediately — silence is complicity'],
    say: 'For Indigenous youth, cultural identity is central to healing. Actively support each youth\'s cultural plan, including access to Elders, ceremony, smudging and traditional foods, without judgment. Use every young person\'s correct name and pronouns from day one, every time — if you are unsure, ask respectfully and privately. Respond immediately to any racist or discriminatory comment from anyone. Silence is complicity.',
  },
  {
    icon: '🎓', title: 'Training and growing with Evergreen',
    points: ['Mandatory training is tracked in Evergreen Academy', 'Training time is paid; costs are covered', 'Regular supervision with your Program Manager or Coordinator', 'A clear career ladder and staff perks — see Career & perks', 'Look after yourself: bring hard days to supervision'],
    say: 'Your mandatory training is tracked here in Evergreen Academy. Training time is paid and the costs are covered. You will have regular supervision — use it, and bring hard days and difficult feelings there, not home alone. Evergreen has a clear career ladder and staff perks; you can see your next step under Career and perks in the portal.',
  },
  {
    icon: '✅', title: 'You’re ready for the final quiz',
    points: ['15 questions', 'Pass mark: 80% (12 of 15)', 'You can review the lesson and try again', 'Passing adds this course to your training record'],
    say: 'That is the end of the lesson. Next is the final quiz: fifteen questions, and you need eighty percent to pass. If you do not pass the first time, review the lesson and try again. When you pass, this course is added to your training record for your manager to verify. Good luck — and welcome to the team.',
  },
];

// Final quiz — options only. The correct answers live on the server.
export const QUESTIONS = [
  { id: 'q1', q: 'You have reasonable grounds to believe a youth needs protection. What does CFCSA s.14 require?', options: ['Tell your supervisor and let them decide', 'Report to MCFD yourself, immediately', 'Write it in the shift log and wait for the next team meeting', 'Ask the youth for more details before doing anything'] },
  { id: 'q2', q: 'A youth refuses to go to school. Which response is NOT allowed?', options: ['Offering a quiet alternative and checking in later', 'Contacting the school as part of the care team', 'Withholding the youth’s dinner as a consequence', 'Writing an objective shift log entry about it'] },
  { id: 'q3', q: 'Which type of physical restraint is prohibited under all circumstances?', options: ['Any NVCI-taught hold', 'Prone (face-down) restraint', 'A hold used with a second staff present', 'Escorting a youth away from danger'] },
  { id: 'q4', q: 'When may physical restraint be used?', options: ['When a youth refuses an instruction', 'As a consequence after an assault', 'Only with imminent risk of serious harm, less restrictive approaches have failed, you are NVCI-certified, and a second staff is present or called', 'Whenever a supervisor asks you to'] },
  { id: 'q5', q: 'When must the shift log be written?', options: ['Before you leave the facility at the end of your shift', 'Within 24 hours', 'At the start of your next shift', 'Only when something goes wrong'] },
  { id: 'q6', q: 'Which shift log entry meets Evergreen’s standard?', options: ['“Youth was aggressive.”', '“Good shift. Youth okay.”', '“At 19:15 youth threw a plastic cup at staff; no injury; verbal de-escalation used; supervisor notified 19:20.”', '“Youth was difficult and manipulative today.”'] },
  { id: 'q7', q: 'A youth goes missing (Category 1 critical incident). What are the MCFD timelines?', options: ['Written report by the end of next week', 'Verbal report within 2 hours and written critical incident report within 24 hours', 'Only include it in the weekly report', 'No report needed if the youth returns the same day'] },
  { id: 'q8', q: 'When can you give a youth their medication?', options: ['After watching a coworker do it once', 'Only after you complete medication training and the Program Manager authorizes you in writing', 'Any time the youth asks for it', 'When the MAR has already been pre-signed'] },
  { id: 'q9', q: 'What are the Five Rights of medication administration?', options: ['Right youth, medication, dose, route, and time', 'Right staff, pharmacy, cup, water, and room', 'Right doctor, nurse, day, week, and month', 'Right youth, food, drink, place, and mood'] },
  { id: 'q10', q: 'You are not sure which pronouns a youth uses. What should you do?', options: ['Use the pronouns on their birth certificate', 'Ask the youth respectfully and privately', 'Avoid using any name or pronoun with them', 'Ask the other youth in the house'] },
  { id: 'q11', q: 'A reporter calls asking whether a certain youth lives at your house. What do you do?', options: ['Confirm it, but give no other details', 'Deny that any youth live there', 'Do not confirm or deny — refer them to the Program Manager', 'Give them the youth’s social worker’s number'] },
  { id: 'q12', q: 'A youth in your care sends you a friend request on Instagram. What is correct?', options: ['Accept, but keep messages professional', 'Accept after they are discharged next week', 'Decline — never connect with current or recently discharged youth on personal social media', 'Accept and mute their posts'] },
  { id: 'q13', q: 'Which of these is one of your three rights under the Workers Compensation Act?', options: ['The right to refuse work you reasonably believe is unsafe', 'The right to skip mandatory training', 'The right to work alone without check-ins', 'The right to restrain a youth in self-defence at any time'] },
  { id: 'q14', q: 'A youth shares something concerning but begs you to keep it a secret. Your duty to report…', options: ['…no longer applies because it was shared in confidence', '…still applies — confidentiality does not cancel the duty to report', '…only applies if the youth agrees', '…applies only if you are sure it is true'] },
  { id: 'q15', q: 'When are your probation reviews?', options: ['Only once, at 1 year', 'At 30, 90 and 120 days — then confirmation to full-time', 'Every week for 6 months', 'There is no probation'] },
];
