// ⚖️ Rules and laws we follow — plain-words summaries of the BC laws, ministry standards and funder policies
// that shape day-to-day work in our houses. Shown on the Help page. Researched October 2026; each rule links to
// its source. For: 'youth' = MCFD (children and youth in care), 'adults' = CLBC, 'all' = everyone.
export const RULES_CHECKED = 'October 2026';

// Evergreen's own rules come from the Staff Rules and Regulations Handbook (signed at orientation and every year).
export const HANDBOOK = { label: 'Evergreen Staff Rules and Regulations Handbook v1.1' };

export const RULES = [
  {
    id: 'report-child', icon: '🚨', for: 'youth', title: 'You must report if a child or youth may be abused or neglected',
    points: [
      'Everyone in BC has a legal duty to report (Child, Family and Community Service Act). It applies to you personally.',
      'Telling your Program Coordinator does not replace your own report. Do both.',
      'You don’t need proof. Report what you saw or heard, and don’t question the youth or investigate yourself.',
      'Danger right now? Call 911 first. Then call Provincial Centralized Screening: 1-800-663-9122, 24 hours a day, every day.',
      'Then tell on-call and your Program Coordinator, and write an incident report in the CRM with the facts.',
      'Youth can call the Helpline for Children themselves: 1-877-631-8282 (free, any time).',
    ],
    sources: [{ label: 'BC Gov: Reporting child abuse', url: 'https://www2.gov.bc.ca/gov/content/safety/public-safety/protecting-children/reporting-child-abuse' }],
  },
  {
    id: 'report-adult', icon: '🚨', for: 'adults', title: 'Abuse or neglect of an adult we support',
    points: [
      'Community Living BC (CLBC) is the agency that responds to abuse and neglect of adults it serves (Adult Guardianship Act).',
      'Danger right now? Call 911 first.',
      'Then report to the local CLBC office (toll-free 1-877-660-2522). When CLBC offices are closed, call Provincial Centralized Screening: 1-800-663-9122.',
      'CLBC must keep the name of the person who reported confidential.',
      'Tell on-call and your Program Coordinator, and write an incident report in the CRM.',
    ],
    sources: [
      { label: 'CLBC: Reporting abuse or neglect', url: 'https://www.communitylivingbc.ca/?p=144' },
      { label: 'CLBC Critical Incidents Policy', url: 'https://www.communitylivingbc.ca/wp-content/uploads/Critical-Incidents-Policy.pdf' },
    ],
  },
  {
    id: 'rights', icon: '🧒', for: 'youth', title: 'Rights of children and youth in care',
    points: [
      'Children and youth in care have these rights under section 70 of the Child, Family and Community Service Act. Every staff member must respect them:',
      'To be fed, clothed and cared for as well as other children in the home.',
      'To know their care plan and be asked their views on big decisions about them.',
      'To reasonable privacy and to keep their own belongings.',
      'To be free from physical punishment.',
      'To know the house rules and what happens if they’re broken.',
      'To medical and dental care when needed.',
      'To social and recreational activities, and to practise their religion.',
      'To keep their culture. Indigenous children and youth also have the right to learn their traditions and languages and belong to their community.',
      'To an interpreter if language or disability makes it hard to take part in decisions.',
      'To talk privately with family, a lawyer, the Representative for Children and Youth, the Ombudsperson or an MLA.',
      'To be told about these rights and how to use them.',
    ],
    sources: [
      { label: 'RCY: Section 70 rights', url: 'https://rcybc.ca/wp-content/uploads/2019/12/section_70_rights.pdf' },
      { label: 'Standards for Staffed Children’s Residential Services', url: 'https://www2.gov.bc.ca/assets/gov/family-and-social-supports/data-monitoring-quality-assurance/information-for-service-providers/standards_residential_services.pdf' },
    ],
  },
  {
    id: 'never', icon: '⛔', for: 'all', title: 'Things we never do',
    points: [
      'Hit, spank, shake or use any physical punishment.',
      'Humiliate, ridicule, swear at or threaten a youth or adult, including threats that they’ll have to move out.',
      'Take away food, clothing, bedding or other basic needs as a consequence.',
      'Lock anyone in a room, or use seclusion or a “safe room”. (A short time-out is different.)',
      'Stop family visits, calls or letters as a punishment.',
      'Let one youth discipline another.',
      'Force or pressure anyone about religion or personal beliefs.',
      'Give harmful or unreasonable exercise or chores as punishment.',
      'Do body searches or strip searches. Other searches need a good reason and must be respectful and the least intrusive.',
    ],
    sources: [{ label: 'Standards for Staffed Children’s Residential Services (D.7.7)', url: 'https://www2.gov.bc.ca/assets/gov/family-and-social-supports/data-monitoring-quality-assurance/information-for-service-providers/standards_residential_services.pdf' }],
  },
  {
    id: 'restraint', icon: '✋', for: 'all', title: 'Physical restraint: only to stop immediate harm',
    points: [
      'Use positive behaviour support first: praise, calm, clear expectations, and setting things up for success.',
      'Physical restraint is only allowed to protect someone from immediate physical harm, when less restrictive ways didn’t work or aren’t possible.',
      'Only staff trained in restraint (for example NVCI) may do it. Use the least force, stop as soon as it’s safe, and never leave the person alone.',
      'Afterwards: check the person for injuries and how they’re feeling, debrief with them, any witnesses and your manager, and write it up with their side and yours.',
      'Youth: tell the youth’s social worker right away. Adults (CLBC): any restraint or other restricted practice is a critical incident and must be reported to CLBC. Seclusion is never allowed.',
    ],
    sources: [
      { label: 'Standards for Staffed Children’s Residential Services', url: 'https://www2.gov.bc.ca/assets/gov/family-and-social-supports/data-monitoring-quality-assurance/information-for-service-providers/standards_residential_services.pdf' },
      { label: 'CLBC Critical Incidents Policy', url: 'https://www.communitylivingbc.ca/wp-content/uploads/Critical-Incidents-Policy.pdf' },
    ],
  },
  {
    id: 'incidents-youth', icon: '📝', for: 'youth', title: 'Reporting incidents for youth (MCFD)',
    points: [
      'Tell the youth’s social worker right away about: death; injury or illness that needs a doctor; abuse or neglect allegations; self-harm or high-risk behaviour; suicide threats or attempts; missing; police involvement; any restraint; school suspension; unplanned overnights away; big changes in behaviour.',
      'The written Reportable Incident Form goes to MCFD within 24 hours, one form per incident. Your Program Coordinator or Manager sends it, using your incident report in the CRM.',
      'So write your CRM incident report before you leave your shift: facts only, what you saw and heard, times, who was told.',
      'Serious events are also reported by MCFD to the Representative for Children and Youth.',
    ],
    sources: [
      { label: 'Standards for Staffed Children’s Residential Services', url: 'https://www2.gov.bc.ca/assets/gov/family-and-social-supports/data-monitoring-quality-assurance/information-for-service-providers/standards_residential_services.pdf' },
      { label: 'SHSS Service Provider Operational Policy, appendices', url: 'https://www2.gov.bc.ca/assets/gov/family-and-social-supports/foster-parenting/specialized-homes-and-support-services/shss-documents/service_provider_operational_policy_for_shss__appendices.pdf' },
      { label: 'MCFD Reportable Circumstances Policy', url: 'https://www2.gov.bc.ca/assets/gov/family-and-social-supports/data-monitoring-quality-assurance/reportable_circumstances_policy.pdf' },
    ],
  },
  {
    id: 'incidents-adults', icon: '📝', for: 'adults', title: 'Critical incidents for adults (CLBC)',
    points: [
      'Urgent incidents (abuse or neglect allegations, sudden death, serious harm): call CLBC right away, and send the Critical Incident Report within 24 hours.',
      'Non-urgent incidents (for example unexpected illness, unusual behaviour, service disruption): report within 5 working days.',
      'Other critical incidents include aggression between people, attempted suicide, choking, serious drug misuse, poisoning, falls or medication errors needing emergency care, going missing, and any restricted practice.',
      'Smaller unusual events still get recorded in the CRM so we can spot patterns.',
    ],
    sources: [{ label: 'CLBC Critical Incidents Policy (amended Nov 2024)', url: 'https://www.communitylivingbc.ca/wp-content/uploads/Critical-Incidents-Policy.pdf' }],
  },
  {
    id: 'missing', icon: '🔎', for: 'youth', title: 'When a youth is missing',
    points: [
      'Search the house, yard and nearby area, including their room. Call and text their phone, check social media, and call friends, family, school and the hospital.',
      'Call police right away if the youth is at higher risk (young, mental health or support needs) or you think they’re in danger. Don’t wait.',
      'Give police: a recent photo, description and clothing, medical and mental health needs, friends and places they go, phone and social media, and when and with whom they were last seen. Ask police not to say publicly that the youth is in care.',
      'Tell on-call and the youth’s social worker (or 1-800-663-9122 after hours) what you’ve done and the police file number.',
      'Evergreen timings: start the missing youth log from minute one, search for 30 minutes at most (it’s a maximum, not a waiting period), tell the Program Manager within 30 minutes, and call police if there’s no direction after 1 hour. The Executive Director is told if the youth is missing over 2 hours.',
      'When they come back: welcome them calmly, with no anger or punishment. Check for injuries, tell everyone they’re back, and pass on where they were.',
    ],
    sources: [
      { label: 'MCFD: When a child or youth in care is missing (Oct 2023)', url: 'https://www2.gov.bc.ca/assets/gov/family-and-social-supports/children-teens-with-support-needs/interim_practice_guideline_-_when_a_child_or_youth_in_care_is_missing.pdf' },
      HANDBOOK,
    ],
  },
  {
    id: 'meds', icon: '💊', for: 'all', title: 'Medication',
    points: [
      'Only give prescribed or over-the-counter medication that has been approved and is on the person’s MAR.',
      'Record every dose on the MAR right away, including refused or missed doses.',
      'Keep medication locked and stored safely.',
      'A medication error is an incident: get medical advice if needed, tell on-call, and report it.',
    ],
    sources: [{ label: 'Standards for Staffed Children’s Residential Services', url: 'https://www2.gov.bc.ca/assets/gov/family-and-social-supports/data-monitoring-quality-assurance/information-for-service-providers/standards_residential_services.pdf' }],
  },
  {
    id: 'privacy', icon: '🔒', for: 'all', title: 'Records and privacy',
    points: [
      'Write a daily note for every youth or adult each shift: facts, not opinions.',
      'A youth’s file belongs to the ministry, not to us. Never destroy or remove records.',
      'Share personal information only with people who are allowed to know it under the law and our policy.',
      'No photos, videos or social media posts of a youth without written permission from their social worker. Never post about the people we support.',
      'Don’t talk about residents outside work, or in front of other residents.',
    ],
    sources: [{ label: 'Standards for Staffed Children’s Residential Services', url: 'https://www2.gov.bc.ca/assets/gov/family-and-social-supports/data-monitoring-quality-assurance/information-for-service-providers/standards_residential_services.pdf' }],
  },
  {
    id: 'voice', icon: '📣', for: 'youth', title: 'Complaints and the youth’s voice',
    points: [
      'Youth can complain about their care. We take it seriously, deal with it fairly and quickly, and there are never any consequences for complaining.',
      'Help them understand how to contact their social worker, the Representative for Children and Youth (1-800-476-3933, rcybc.ca) or the Ombudsperson, and let them call in private.',
    ],
    sources: [
      { label: 'Representative for Children and Youth', url: 'https://rcybc.ca/' },
      { label: 'Standards for Staffed Children’s Residential Services', url: 'https://www2.gov.bc.ca/assets/gov/family-and-social-supports/data-monitoring-quality-assurance/information-for-service-providers/standards_residential_services.pdf' },
    ],
  },
  {
    id: 'safety', icon: '🦺', for: 'all', title: 'Your safety at work',
    points: [
      'WorkSafeBC requires a check-in system when you work alone. Ours: clock in at the house, answer the safety questions at check-out, and use 🆘 in an emergency. On-call is always reachable.',
      'Hot water that youth can reach must not be hotter than 42°C. Report it if it is.',
      'Report any injury to yourself the same shift.',
    ],
    sources: [
      { label: 'BC Gov: Working alone check-ins (OHS Reg 4.20.1)', url: 'https://www2.gov.bc.ca/gov/content/careers-myhr/all-employees/health-safety-and-sick-leave-resources/workplace/planning/working-alone-risk-assessment' },
      { label: 'Standards for Staffed Children’s Residential Services', url: 'https://www2.gov.bc.ca/assets/gov/family-and-social-supports/data-monitoring-quality-assurance/information-for-service-providers/standards_residential_services.pdf' },
    ],
  },
  {
    id: 'crc', icon: '🪪', for: 'all', title: 'Criminal record checks',
    points: [
      'Everyone who works with children or vulnerable adults needs a criminal record check through the BC Criminal Records Review Program, renewed every 5 years.',
      'If you are charged with or convicted of an offence, you must tell us right away. You need a new check before you can keep working with youth or adults.',
    ],
    sources: [{ label: 'BC Gov: Criminal Records Review Program', url: 'https://www2.gov.bc.ca/gov/content/safety/crime-prevention/criminal-record-check/organizations/screen' }],
  },
  {
    id: 'hours', icon: '⏱', for: 'all', title: 'Hours, rest and pay (BC Employment Standards)',
    points: [
      'By law you get at least 8 hours off between shifts. Our schedule gives at least 11 hours.',
      'You get at least 32 hours in a row off each week, or are paid time-and-a-half for working in that time.',
      'Overtime is paid after 8 hours in a day or 40 hours in a week. Our full-time is 36 hours, and part-timers can pick up to 36.',
      'After 5 hours in a row you get a 30-minute meal break. If you must stay on duty during it, it’s paid.',
      'Your collective agreement, if you have one, can give you more than these minimums.',
    ],
    sources: [
      { label: 'ESA s. 36: Hours free from work', url: 'https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/forms-resources/igm/esa-part-4-section-36' },
      { label: 'BC Gov: Hours of work and overtime', url: 'https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/hours' },
    ],
  },
  {
    id: 'bullying', icon: '🤝', for: 'all', title: 'Bullying and harassment at work (WorkSafeBC)',
    points: [
      'Bullying and harassment is anything said or done to a worker that the person knew, or should have known, would humiliate or intimidate them. Examples: yelling, insults, spreading rumours, leaving someone out on purpose, threats, mocking, unwanted sexual comments or touching, and online or text messages.',
      'It is not bullying when a supervisor gives reasonable direction, feedback, schedules or discipline in a respectful way.',
      'By law, Evergreen must prevent it, have a reporting and investigation process, train staff, investigate fairly and confidentially, fix it, and review the policy every year.',
      'Your duty: don’t bully or harass anyone, and report it when it happens to you or you see it.',
      'How to report: tell your supervisor, or the next level up if your supervisor is involved (Program Manager → Director of Operations → Executive Director). Write down what happened, when and who saw it.',
      'You can also call WorkSafeBC’s Prevention Information Line: 1-888-621-7233.',
      'Retaliating against anyone who reports in good faith is not allowed.',
    ],
    sources: [
      { label: 'WorkSafeBC: Bullying and harassment', url: 'https://worksafebc.com/en/health-safety/hazards-exposures/bullying-harassment/resource-tool-kit' },
      { label: 'Here to Help: WorkSafeBC and bullying', url: 'https://www.heretohelp.bc.ca/visions/workplace-bullying-and-harassment-vol15/worksafebc-and-bullying' },
      HANDBOOK,
    ],
  },
  {
    id: 'human-rights', icon: '🌈', for: 'all', title: 'Human rights and respect (BC Human Rights Code)',
    points: [
      'No one at Evergreen may be treated unfairly or harassed because of: race, colour, ancestry or place of origin; Indigenous identity; religion or political belief; sex, sexual orientation, or gender identity or expression; age; physical or mental disability; marital or family status; or a criminal conviction that has nothing to do with the job.',
      'This protects staff, youth, adults, families and visitors.',
      'Use each person’s name and pronouns. Respect their culture, language, faith, food needs and spirituality.',
      'Need a change at work because of a disability, religion, family status or another protected reason? Ask your Program Manager, in writing if you can. Evergreen must find a reasonable solution unless it would cause undue hardship. You only need to share how it affects your work, not your diagnosis.',
      'Concerns go to your supervisor or the next level up. You can also file with the BC Human Rights Tribunal within 1 year of what happened. The BC Human Rights Clinic gives free help: 1-855-685-6222.',
    ],
    sources: [
      { label: 'People’s Law School: Employer duty to accommodate', url: 'https://peopleslawschool.ca/employer-duty-to-accommodate' },
      { label: 'BC Human Rights Tribunal', url: 'https://www.bchrt.bc.ca/' },
      HANDBOOK,
    ],
  },
];

export const RULE_FOR = { youth: 'Youth (MCFD)', adults: 'Adults (CLBC)', all: 'Everyone' };

// 🌲 Evergreen’s own rules (agency compliance). Where these are stricter than the law, these apply.
export const EVERGREEN_RULES = [
  {
    id: 'ev-zero', icon: '🔴', title: 'Zero-tolerance rules',
    points: [
      'Breaking any of these means you are taken off the schedule right away, investigated, and may be dismissed and reported to MCFD, CLBC, police or a professional body:',
      'Any abuse, neglect or exploitation of a youth or adult, or physical punishment, humiliation, swearing at or shaming them.',
      'Withholding food, sleep, clothing, medical care, family or cultural contact, or rights as a consequence.',
      'Any romantic or sexual contact, or contact outside work (phone, text, social media, visits, rides) with youth, adults in care or their families.',
      'Prone holds, pressure on the neck, chest or back, mechanical or chemical restraint, or seclusion.',
      'Leaving people without the required supervision, leaving before you are relieved, or sleeping on an awake night shift.',
      'Changing, back-dating, deleting or faking a record, or signing for something you didn’t do or see.',
      'Working impaired, or bringing alcohol, drugs or weapons to work.',
      'Photos or videos of youth on your own phone, or posting anything about youth or the program online.',
      'Bullying, harassment, sexual harassment, violence or discrimination.',
      'Getting someone else to do your training, sharing quiz answers, or a false certificate.',
      'Discouraging or punishing anyone who complains or reports, or retaliating against them.',
    ],
    sources: [HANDBOOK],
  },
  {
    id: 'ev-cleared', icon: '✅', title: 'Staying cleared to work (compliance)',
    points: [
      'No contact with youth or adults until your criminal record check (vulnerable sector) is clear. It’s renewed every 5 years.',
      'Before your first shift: orientation, Youth Rights, Mandatory Reporting, Vulnerable Adult Reporting, WHMIS, and this handbook signed.',
      'Before your first solo shift: First Aid / CPR Level C, NVCI Module 1, 3 supervised shifts signed off, policies signed, and Naloxone 101.',
      'Keep every training and certificate current. If one expires, you’re off the schedule until it’s renewed. Renewals are booked 30 days before expiry.',
      'Tell your Program Manager within 24 hours if you’re charged or convicted, under a protection investigation, or your licence is suspended.',
      'Drivers: valid licence, insurance, and a driver’s abstract every year.',
      'Re-sign the handbook every year, and policies within 30 days of a change.',
    ],
    sources: [HANDBOOK],
  },
  {
    id: 'ev-boundaries', icon: '🚧', title: 'Professional boundaries',
    points: [
      'No secrets with youth, and never promise to keep something private that must be reported.',
      'No gifts, money or loans to or from youth, clients or families. A small card or drawing is fine.',
      'Physical contact must be brief, welcome and in view of others (a side hug or high-five). No tickling, wrestling, lap sitting or massage.',
      'Keep doors open for one-to-one time and tell your co-worker.',
      'Don’t share your address, personal problems or personal social media. Don’t bring your own family or friends to the house.',
      'Tell your Program Manager first if you already know a youth or their family.',
    ],
    sources: [HANDBOOK],
  },
  {
    id: 'ev-deadlines', icon: '⏰', title: 'Deadlines at a glance',
    points: [
      'Abuse or neglect: report it yourself, right away. Danger, overdose or fire: 911 right away.',
      'Any incident: tell on-call right away. Incident report written before the end of your shift.',
      'Daily notes: before you leave your shift. Program Coordinator reviews notes and incidents within 24 hours.',
      'MCFD and CLBC told about incidents within 24 hours (serious ones by phone right away). Debrief within 72 hours.',
      'Hazard, injury or near miss: the same shift.',
      'Sick or late: call on-call at least 4 hours before your shift, or as soon as you know. No-call, no-show is serious misconduct.',
      'Complaints: acknowledged within 2 business days, resolved or escalated within 30 days.',
      'Fire drill and home safety check: every month.',
    ],
    sources: [HANDBOOK],
  },
  {
    id: 'ev-speak', icon: '🗣', title: 'Speaking up and whistleblower protection',
    points: [
      'Concerns go: your supervisor → Program Manager → Director of Operations → Executive Director. Skip anyone who is involved.',
      'Reporting unsafe practice, abuse, fraud or a broken rule in good faith is protected. Retaliation is zero tolerance.',
      'You have the right to refuse unsafe work. Tell your supervisor right away.',
      'Media requests go to the Executive Director only.',
    ],
    sources: [HANDBOOK],
  },
  {
    id: 'ev-discipline', icon: '📄', title: 'If rules aren’t followed: the fair process',
    points: [
      'First small concern: a coaching conversation (not a letter).',
      'Then Letter of Expectation #1, #2 and #3 (final notice). 3 letters within 24 months may lead to dismissal. Letters older than 24 months don’t count.',
      'A serious breach (for example faking a record, an unreported medication error, leaving youth unsupervised, no-call/no-show) gets a Final Written Warning, which counts as #3.',
      'You’re told the concern before the meeting, can bring a support person, and give your side. You can add a written response and appeal within 10 business days.',
    ],
    sources: [HANDBOOK, { label: 'Staff Duties, Expectations, Performance Badges and Bonus' }],
  },
];
