// Evergreen's 90-day orientation and training plan for every new staff member.
// Built from the G.3 training matrix due days, the in-house Academy courses and the free government courses.
// day = due this many days after the hire date. kind: academy | free | inperson | onboarding | signoff
// title must match the training record title so the plan ticks items off automatically.
export const PLAN_PHASES = [
  { key: 'day1', label: 'Day 1 — orientation day', range: 'Day 1', hint: 'Paid, in person with your Program Coordinator. About 6 hours.' },
  { key: 'week1', label: 'Week 1 — shadow shifts', range: 'Days 2–7', hint: 'At least 3 supervised shifts. About 15 minutes of online learning per shift.' },
  { key: 'month1', label: 'Days 8–30', range: 'By day 30', hint: 'Core child-protection and safety courses. 30-day probation review.' },
  { key: 'month2', label: 'Days 31–60', range: 'By day 60', hint: 'Culture, identity and trauma-informed practice.' },
  { key: 'month3', label: 'Days 61–90', range: 'By day 90', hint: 'Behaviour support and full crisis certification. 90-day probation review.' },
];

export const PLAN_ITEMS = [
  // ---------- Day 1 ----------
  { phase: 'day1', day: 0, kind: 'onboarding', title: 'Onboarding paperwork (CRC, offer, references, résumé)', href: '/onboarding', minutes: 30, program: 'Both' },
  { phase: 'day1', day: 0, kind: 'academy', title: 'New Staff Orientation (Evergreen Academy course)', label: 'New Staff Orientation — video and quiz', href: '/academy/orientation', minutes: 25, program: 'Both' },
  { phase: 'day1', day: 0, kind: 'inperson', title: 'OHS Orientation + Program Manual', minutes: 240, program: 'Both', who: 'Program Coordinator — tour, exits, emergency procedures, meet your mentor' },
  { phase: 'day1', day: 0, kind: 'academy', title: 'Workplace Violence Prevention', href: '/academy/course/workplace_violence', minutes: 20, program: 'Both' },
  { phase: 'day1', day: 0, kind: 'inperson', title: 'WHMIS 2015', minutes: 90, program: 'Both', who: 'WorkSafeBC-approved course — upload the certificate in Academy → Add training' },
  // ---------- Week 1 ----------
  { phase: 'week1', day: 7, kind: 'academy', title: 'Youth Rights (CFCSA s.70)', href: '/academy/course/youth_rights', minutes: 20, program: 'MCFD' },
  { phase: 'week1', day: 7, kind: 'onboarding', title: 'Read and sign the policies', href: '/onboarding', minutes: 60, program: 'Both' },
  { phase: 'week1', day: 7, kind: 'free', title: 'Naloxone 101 (Toward the Heart)', label: 'Naloxone 101 — overdose response', href: '/academy/external/naloxone', minutes: 60, program: 'Both' },
  { phase: 'week1', day: 7, kind: 'academy', title: 'Working Alone Safety', href: '/academy/course/working_alone', minutes: 15, program: 'Both', ifApplicable: 'before your first solo overnight' },
  { phase: 'week1', day: 7, kind: 'academy', title: 'Driver Safety + annual driver’s abstract', label: 'Driver Safety', href: '/academy/course/driver_safety', minutes: 15, program: 'Both', ifApplicable: 'before you drive for work' },
  { phase: 'week1', day: 7, kind: 'signoff', title: '3 supervised shifts with your mentor', minutes: 0, program: 'Both', who: 'Program Coordinator signs off before your first solo shift' },
  // ---------- Days 8–30 ----------
  { phase: 'month1', day: 30, kind: 'academy', title: 'Mandatory Reporting (CFCSA s.14)', href: '/academy/course/mandatory_reporting', minutes: 20, program: 'MCFD' },
  { phase: 'month1', day: 30, kind: 'free', title: 'BC Handbook for Action on Child Abuse and Neglect (read)', label: 'BC Child Abuse & Neglect Handbook — read and reflect', href: '/academy/external/bc_child_abuse_handbook', minutes: 60, program: 'MCFD' },
  { phase: 'month1', day: 30, kind: 'academy', title: 'Abuse Recognition and Prevention', href: '/academy/course/abuse_recognition', minutes: 20, program: 'Both' },
  { phase: 'month1', day: 30, kind: 'academy', title: 'Missing Child/Youth Protocol', href: '/academy/course/missing_youth', minutes: 20, program: 'MCFD' },
  { phase: 'month1', day: 30, kind: 'academy', title: 'Privacy and FOIPPA', href: '/academy/course/privacy', minutes: 15, program: 'Both' },
  { phase: 'month1', day: 30, kind: 'academy', title: 'Vulnerable Adult Abuse & Neglect Reporting (Adult Guardianship Act)', label: 'Vulnerable Adult Reporting', href: '/academy/course/adult_protection', minutes: 15, program: 'CLBC' },
  { phase: 'month1', day: 30, kind: 'inperson', title: 'First Aid / CPR Level C', minutes: 960, program: 'Both', who: 'Red Cross, St. John or equivalent — before your first unsupervised shift' },
  { phase: 'month1', day: 30, kind: 'academy', title: 'Medication Administration — Theory (Evergreen Academy)', label: 'Medication Administration — Theory', href: '/academy/course/medication_theory', minutes: 15, program: 'Both', ifApplicable: 'before any medication duty, then the hands-on sign-off' },
  { phase: 'month1', day: 30, kind: 'signoff', title: '30-day probation review', minutes: 0, program: 'Both', who: 'Program Manager' },
  // ---------- Days 31–60 ----------
  { phase: 'month2', day: 60, kind: 'academy', title: 'LGBTQ2S+ Inclusion', href: '/academy/course/lgbtq_inclusion', minutes: 15, program: 'MCFD' },
  { phase: 'month2', day: 60, kind: 'free', title: 'Gender-Affirming Relational Practice (Trans Care BC)', label: 'Gender-Affirming Relational Practice (Trans Care BC)', href: '/academy/external/tcbc_garp', minutes: 120, program: 'MCFD' },
  { phase: 'month2', day: 60, kind: 'inperson', title: 'Indigenous Cultural Safety and Humility', minutes: 480, program: 'Both', who: 'San’yas or FNHA — upload the certificate in Academy → Add training' },
  { phase: 'month2', day: 60, kind: 'free', title: 'Indigenous Learning Series (Canada School of Public Service)', label: 'Indigenous Learning Series (free)', href: '/academy/external/csps_indigenous', minutes: 60, program: 'Both' },
  { phase: 'month2', day: 60, kind: 'inperson', title: 'Trauma-Informed Practice', minutes: 360, program: 'Both', who: 'Provider assigned by your manager' },
  { phase: 'month2', day: 60, kind: 'inperson', title: 'Suicide and Self-Harm Response (ASIST or safeTALK)', minutes: 840, program: 'Both', who: 'LivingWorks — booked by your manager' },
  { phase: 'month2', day: 60, kind: 'free', title: 'Violence in the Workplace: Awareness (CCOHS)', label: 'Violence in the Workplace: Awareness (CCOHS, free)', href: '/academy/external/ccohs_violence', minutes: 60, program: 'Both' },
  { phase: 'month2', day: 60, kind: 'academy', title: 'Restricted Practices (CLBC policy)', href: '/academy/course/restricted_practices', minutes: 15, program: 'CLBC' },
  // ---------- Days 61–90 ----------
  { phase: 'month3', day: 90, kind: 'academy', title: 'Person-Centred Practice & Positive Behaviour Support', href: '/academy/course/positive_behaviour_support', minutes: 20, program: 'Both' },
  { phase: 'month3', day: 90, kind: 'inperson', title: 'Non-Violent Crisis Intervention (NVCI)', minutes: 420, program: 'Both', who: 'Module 1 before your first solo shift; full certification by day 90' },
  { phase: 'month3', day: 90, kind: 'free', title: 'Supervising for Safety (WorkSafeBC)', label: 'Supervising for Safety (WorkSafeBC)', href: '/academy/external/supervising_safety', minutes: 120, program: 'Both', leaders: true },
  { phase: 'month3', day: 90, kind: 'signoff', title: '90-day probation review and confirmation', minutes: 0, program: 'Both', who: 'Program Manager' },
];
