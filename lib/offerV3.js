// Offer letter version 3 (Nov 16 2026): the full Evergreen employment agreement, worded for the person's program
// stream (MCFD children and youth, CLBC adults, or both), with Schedule 1 (position details) and Schedule 2 (key dates
// worked out from the start date). Built from the HR review "Evergreen Offer Letter - Best-Practice Sample".
// Returns plain nodes so the same letter is drawn on screen (offerHtml) and in the signed PDF (offerLines).
//   { h: 'Part A: ...' }            section heading
//   { p: 'text', b: 'Lead.' }       paragraph with an optional bold lead
//   { ul: [...] } / { ol: [...] }   lists
//   { table: [[k, v], ...], head }  two- or three-column table
//   { pageBreak: true }             new page when printed

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s) => (s ? new Date(String(s).slice(0, 10) + 'T12:00:00Z') : null);
const addDays = (s, n) => { const d = parse(s); if (!d) return null; d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const addMonths = (s, n) => {
  const d = parse(s); if (!d) return null;
  const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return iso(d);
};
const longDay = (s) => (s ? parse(s).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '[date]');
const monthYear = (s) => (s ? parse(s).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', timeZone: 'UTC' }) : '[date]');
const $ = (n) => (n == null ? '[rate]' : `$${Number(n).toFixed(2)}`);

const STREAM = {
  MCFD: {
    program: "Evergreen's MCFD children and youth program", who: 'youth', whoFull: 'the children and youth in your care',
    standards: 'the MCFD Specialized Homes and Support Services standards', crc: 'work with children',
    rights: 'respect and uphold the rights of children and youth in care under section 70 of the Child, Family and Community Service Act',
    orientation: 'the MCFD orientation', policyManual: 'the MCFD Residential Care Policy Manual (ECC-RC-POL-2026-003)',
    scope: 'Children', streamLabel: 'MCFD: children and youth',
  },
  CLBC: {
    program: "Evergreen's CLBC adult program", who: 'adults we support', whoFull: 'the adults in your care',
    standards: 'the CLBC standards and the CLBC policies for your program', crc: 'work with vulnerable adults',
    rights: 'respect and uphold the rights, dignity, privacy and choices of the adults we support, as Evergreen\'s Rights, Respect and Dignity Policy (ECC-RIGHTS-POL-2026-001) and the CLBC standards require',
    orientation: 'the CLBC orientation', policyManual: 'the CLBC policies for your program, including the Rights, Respect and Dignity Policy (ECC-RIGHTS-POL-2026-001) and the Complaint Resolution Policy (ECC-RC-COMP-2026-001)',
    scope: 'Vulnerable adults', streamLabel: 'CLBC: adults',
  },
  Both: {
    program: "Evergreen's MCFD children and youth program and CLBC adult program", who: 'people in your care', whoFull: 'the children, youth and adults in your care',
    standards: 'the MCFD Specialized Homes and Support Services standards and the CLBC standards', crc: 'work with children and with vulnerable adults',
    rights: 'respect and uphold the rights of children and youth in care under section 70 of the Child, Family and Community Service Act, and the rights, dignity and choices of adults under the CLBC standards',
    orientation: 'the MCFD and CLBC orientations', policyManual: 'the MCFD Residential Care Policy Manual (ECC-RC-POL-2026-003) and the CLBC policies for your program',
    scope: 'Children and vulnerable adults', streamLabel: 'MCFD and CLBC: children, youth and adults',
  },
};

const CLASS = {
  'youth worker': 'Residential Child and Youth Worker', 'support worker i': 'Community Support Worker',
  'support worker ii': 'Adult, Youth and/or Child Worker', 'senior / lead support worker': 'Residence Worker Senior',
  'program coordinator': 'Residence Coordinator',
};
const LEADER = /coordinator|manager|director/i;

// Key dates from the start date (Schedule 2). Exported so the portal can show them too.
export function offerDates(o) {
  const s = o.start_date;
  return {
    offer: String(o.issued_at ?? o.created_at ?? '').slice(0, 10) || null,
    respondBy: o.respond_by, start: s,
    holidays: addDays(s, 30), review30: addDays(s, 30), review60: addDays(s, 60), review80: addDays(s, 80),
    probationEnds: addDays(addMonths(s, 3), -1), benefits: addMonths(s, 3), sick: addDays(s, 90),
    noticeFrom: addMonths(s, 3), vacation1: addMonths(s, 12), bonus: addMonths(s, 24), vacation5: addMonths(s, 60),
    step2About: addMonths(s, 13),
  };
}

export function offerV3(o, personName) {
  const st = STREAM[o.program] ?? STREAM.Both;
  const dt = offerDates(o);
  const first = String(personName ?? '').trim().split(/\s+/)[0] || personName;
  const full = o.employment_type === 'Full-time';
  const leader = LEADER.test(o.position ?? '');
  const steps = Array.isArray(o.wage_steps) ? o.wage_steps.map(Number) : [];
  const cls = CLASS[String(o.position ?? '').toLowerCase()] ?? o.position;
  const grid = o.grid_level ? `Grid ${o.grid_level}, Step 1 of the BC community social services wage grid${o.grid_effective ? ` in effect on ${longDay(o.grid_effective)}` : ''}` : null;
  const reports = o.reports_to || 'your Program Coordinator';
  const home = o.house || '[home]';
  const N = [];
  const P = (b, p) => N.push({ b, p });

  N.push({ p: `Dear ${first},` });
  N.push({ p: `Re: Offer of Employment and Employment Agreement: ${o.position}`, strong: true });
  N.push({ p: `Evergreen Community Care Inc. ("Evergreen", "we" or "the Employer") is pleased to offer you ("you" or "the Employee") employment as ${o.position} on the terms set out in this letter, Schedule 1 (Position Details) and Schedule 2 (Key Dates) (together, the "Agreement"). Evergreen is a licensed residential care agency that provides 24-hour care to children and youth under contract with the Ministry of Children and Family Development ("MCFD") and to adults under contract with Community Living British Columbia ("CLBC"). Please read this Agreement carefully. When both parties sign it, it is a binding contract of employment.` });

  N.push({ h: 'Part A: The position' });
  P('1. Position and program stream.', `You are employed as ${o.position} (classification: ${cls}) in ${st.program}. Your duties are those in the job description for your position, as updated from time to time, and any other reasonable duties assigned by your supervisor that are consistent with your position and training.`);
  P('2. Reporting.', `You report to ${reports}${/coordinator/i.test(reports) ? ', who reports to the Program Manager' : ''}.`);
  P('3. Place of work and assignment.', `Your home base is ${home}. Because the needs of the people we support and our contracts change, Evergreen may assign you to another Evergreen home, shift team or program within your classification, within a reasonable travelling distance of your home base, with reasonable notice and at the same wage rate. Evergreen will not make a substantial change to your wage, hours or core duties without your written agreement or written notice equal to that required by the Employment Standards Act.`);
  P('4. Employment category.', full
    ? `You are employed as a permanent full-time employee with a regular schedule of ${o.hours ?? '36 hours per week'}.`
    : `You are employed as a permanent part-time employee with a regular schedule of about ${o.hours ?? '[hours] per week'}. Part-time hours are not guaranteed and depend on the schedule.`);

  N.push({ h: 'Part B: The nature of residential care work' });
  P('5. Continuous 24-hour care.', 'Evergreen\'s homes operate 24 hours a day, 365 days a year. You will be assigned to a fixed day, evening or awake-night team working 8-hour shifts, with every other weekend off where staffing allows. You may be scheduled on statutory holidays.');
  P('6. Continuous duty and meals.', `This is a continuous-care position. You are responsible for the safety and supervision of ${st.whoFull} for the whole of your shift. Accordingly:`);
  N.push({ ul: [
    `you will not have a scheduled meal break or rest break, and you must not leave the home or ${st.whoFull} during a shift unless you are properly relieved;`,
    `you may eat during your shift alongside the ${st.who}, including the household meal you prepare with them, as part of the home's family-style routine and within the home's food guideline, or you may bring your own food;`,
    'because you remain on duty throughout, your entire shift, including the time in which you eat, is paid work time, as section 32 of the Employment Standards Act requires when an employee must remain available for work.',
  ] });
  P('7. Handover and holdover.', 'You must not leave a shift until the incoming worker has arrived and received a full handover. If your relief is late or absent, you will remain on duty until the Program Coordinator or on-call manager arranges cover. All extra time is paid, at overtime rates where the Act requires.');
  P('8. Lone work and safety.', `You may work alone with the ${st.who}. Evergreen provides a lone-worker check-in procedure, a 24-hour on-call manager, an emergency phone and a written safety plan for each person known to pose a risk. You may call 911 at any time without first asking permission.`);
  P('9. Nature of the people we support.', `The ${st.who} we support may have experienced trauma, and some may have complex behaviour, mental-health, developmental or medical needs. You acknowledge that the work can be physically and emotionally demanding. Evergreen will provide the training, supervision, debriefing and employee assistance described in this Agreement.`);

  N.push({ h: 'Part C: Wages and hours' });
  P('10. Wage.', `Your starting wage is ${$(o.wage)} per hour${grid ? ` (${grid})` : ''}.${steps.length > 1 ? ` Your wage moves to ${$(steps[1])} per hour after 2,000 hours worked${steps[2] ? ` and to ${$(steps[2])} per hour after 4,000 hours worked` : ''}, subject to satisfactory performance.` : ''} Evergreen reviews wages each April, having regard to the BC community social services wage grid and its MCFD and CLBC funding. Evergreen does not pay shift premiums for evening, night or weekend work.`);
  P('11. Pay.', 'You will be paid by direct deposit every two weeks, no later than 8 days after the end of each pay period, with a written or electronic wage statement. Evergreen will deduct income tax, Canada Pension Plan and Employment Insurance contributions and any other deduction required by law or that you authorize in writing.');
  P('12. Recording time.', 'You must clock in and out in the Evergreen portal for every shift and record any extra time before the end of the pay period. Falsifying a time record is serious misconduct.');
  P('13. Overtime.', 'Evergreen pays overtime as the Employment Standards Act requires: 1.5 times your regular wage for hours over 8 in a day or 40 in a week, and 2 times for hours over 12 in a day. Overtime must be approved in advance by your Program Coordinator or the on-call manager, except in an emergency or a holdover under section 7. You may ask in writing to bank overtime and take it later as paid time off.');
  P('14. Rest between shifts.', 'Evergreen will schedule at least 8 consecutive hours off between shifts and 32 consecutive hours off in each week, except in an emergency or where you agree to an extra shift, in which case you will be paid as the Act requires. Your schedule is posted in the portal at least 2 weeks in advance.');

  N.push({ h: 'Part D: Time off and leave' });
  P('15. Statutory holidays.', 'You are entitled to the 11 British Columbia statutory holidays once you have been employed for 30 calendar days and have worked or earned wages on at least 15 of the 30 days before the holiday. If you work on a statutory holiday, you will be paid an average day\'s pay plus 1.5 times your regular wage for the hours worked (2 times after 12 hours).');
  P('16. Vacation.', 'After 12 months of employment you are entitled to 2 weeks of vacation with vacation pay of at least 4% of your gross wages; after 5 consecutive years, 3 weeks and at least 6%. Vacation is requested through the portal at least 4 weeks in advance and approved by your Program Coordinator to keep the homes safely staffed. Vacation must be taken within 12 months after it is earned. Any vacation pay owing is paid on your final pay cheque.');
  P('17. Sick leave.', 'After 90 days of employment you are entitled to up to 5 days of paid sick leave and 3 days of unpaid sick leave in each calendar year, as the Act provides. You must tell the on-call manager, or report it in the portal, as early as possible and at least 4 hours before your shift where you can, so that care can be covered.');
  P('18. Other leave.', 'You are entitled to every job-protected leave under the Employment Standards Act, including family responsibility, bereavement, compassionate care, critical illness, maternity, parental, domestic or sexual violence, jury duty and reservist leave. Taking a protected leave will never be held against you.');

  N.push({ h: 'Part E: Benefits and support' });
  P('19. Benefits.', 'Subject to the terms of the plans in force from time to time:');
  N.push({ ul: [
    `Extended health and dental: starting the day after your probation ends (${longDay(dt.benefits)}), for full-time employees and part-time employees regularly scheduled at least 20 hours a week, as set out in Evergreen's benefits plan.`,
    'Employee and family assistance program: free, confidential counselling and crisis support from your first day.',
    'Paid training: all orientation and required training, including Evergreen Training Academy courses, is paid at your regular wage.',
    'Debriefing: a debrief with your supervisor after any critical incident, and access to clinical support.',
    "Uniform: any required clothing with Evergreen's name or logo is supplied free.",
    'Mileage: $0.65 per kilometre for approved use of your own vehicle for work.',
    "Evergreen Excellence Bonus: a discretionary bonus after 24 months that meet Evergreen's Performance Bonus policy.",
    "Career ladder: a path to Senior Worker and Program Coordinator, as set out in Evergreen's Total Rewards policy. Management positions require 24 months of service, satisfactory reviews and a decision of the Board of Directors.",
  ] });
  N.push({ p: 'Evergreen may change or replace a benefit plan or provider for all eligible employees on reasonable notice. Benefits continue during any notice period required by the Employment Standards Act.' });

  N.push({ h: 'Part F: Conditions of employment' });
  P('20. Conditions before your first shift.', `This offer and your employment are conditional on the following being completed to Evergreen's satisfaction before you have any contact with a person in care:`);
  N.push({ ol: [
    `a satisfactory criminal record check under the Criminal Records Review Act for ${st.crc};`,
    `any ${o.program === 'CLBC' ? 'CLBC' : o.program === 'MCFD' ? 'MCFD' : 'MCFD or CLBC'} screening required for your role;`,
    'three satisfactory professional references, all from supervisors;',
    'proof of a diploma or degree in Child and Youth Care, Social Work, Community Support Work or a related field and 1 year of direct experience, or an equivalent combination;',
    'current Standard First Aid with CPR;',
    'crisis-prevention and non-violent intervention training (CPI or NVCI), and medication-administration training before you give any medication alone;',
    "if your role includes driving: a valid BC driver's licence, a satisfactory driver's abstract, and business-use vehicle insurance with at least $2 million third-party liability;",
    'proof of your legal eligibility to work in Canada;',
    `${st.orientation}, and signing the policies listed in section 25.`,
  ] });
  P('21. Continuing conditions.', 'You must keep every condition in section 20 current for as long as you work for Evergreen. Your criminal record check must be renewed at least every 5 years and whenever Evergreen reasonably asks. If a condition lapses, you will not be scheduled. For a short, fixable lapse (for example an expired first-aid card), Evergreen may place you on unpaid leave for up to 30 days to restore it; if it is not restored, or cannot be, Evergreen may end your employment under section 39.');
  P('22. Duty to disclose within 24 hours.', 'You must tell your Program Manager or the Executive Director within 24 hours if you are charged with or convicted of any criminal offence, become the subject of a police, child protection or adult protection investigation, have a protection or no-contact order made against you, or lose, or have restricted, any licence or certification needed for your job. Until a new criminal record check is cleared you may not work with the people we support.');

  N.push({ h: 'Part G: Probation' });
  P('23. Probationary period.', `The first 3 months of your employment are a probationary period, ending on ${longDay(dt.probationEnds)}. During probation Evergreen will assess your suitability, including your judgement, reliability, documentation, boundaries, teamwork and care of the ${st.who}. Your supervisor will complete written reviews on or about ${longDay(dt.review30)}, ${longDay(dt.review60)} and ${longDay(dt.review80)}, and discuss each one with you.`);
  P('24. During and after probation.', `Evergreen may end your employment during the first 3 months without notice or pay in place of notice, as the Employment Standards Act permits, provided the decision is made in good faith and not for a reason the Human Rights Code prohibits. Probation may be extended once, by up to 3 months, by written agreement signed before ${longDay(dt.probationEnds)}. An extension does not reduce any right you have under the Act after 3 consecutive months of employment.`);

  N.push({ h: 'Part H: Standards of conduct' });
  P('25. Policies form part of this Agreement.', `Evergreen's policies are conditions of your employment and form part of this Agreement, including: the Staff Code of Conduct and Zero-Tolerance Standards (ECC-HR-COC-2026-001); the Bullying and Harassment Prevention Policy (ECC-HR-BH-2026-001); the Investigation, Removal from Duty and Discipline Procedure (ECC-HR-DISC-2026-001); the Employment Terms, Probation and Termination Policy (ECC-HR-EMP-2026-001); the Restraint and Seclusion Policy (ECC-RS-2026-001); the Medication Administration Manual (ECC-MED-2026-001); ${st.policyManual}; the Staff Rules and Regulations Handbook; the Occupational Health and Safety Program (ECC-OHS-POL-2026-002); and the privacy, records and IT policies. You must read and sign them in the portal before your first shift, and sign any new or updated policy within 14 days of being asked. Evergreen may update its policies to comply with the law, MCFD or CLBC standards, licensing, WorkSafeBC requirements or safety needs. A policy update will not reduce your wage rate or change Parts I and J of this Agreement.`);
  P('26. Duty of care.', 'You must at all times:');
  N.push({ ul: [
    `follow each person's care plan, safety plan and behaviour support plan, and ${st.standards};`,
    "maintain the level of supervision each person's plan requires and know their whereabouts at all times;",
    'use only the de-escalation and physical intervention methods you are trained and authorized to use, and never use a prohibited practice, seclusion or unauthorized restraint;',
    'give medication only as prescribed and trained, and record it on the medication record immediately;',
    'complete shift notes, logs and incident reports in the portal before the end of your shift;',
    `${st.rights};`,
    "provide culturally safe and gender-affirming care, and support each person's cultural plan.",
  ] });
  const reportChild = 'If you have reason to believe a child or youth needs protection, you must report it promptly and directly to a child welfare worker, as section 14 of the Child, Family and Community Service Act requires; this duty is personal and cannot be delegated.';
  const reportAdult = 'If you believe an adult is being abused or neglected, or is neglecting themselves, you must report it immediately to your supervisor so that Evergreen can report to CLBC and, where appropriate, to the designated agency under the Adult Guardianship Act.';
  P('27. Duty to report abuse and neglect.', `${o.program === 'CLBC' ? reportAdult : o.program === 'MCFD' ? reportChild : `${reportChild} ${reportAdult}`} You must also report critical incidents within the timelines in Evergreen's policies.`);
  P('28. Safe and respectful workplace.', 'You must work safely, follow safe work procedures and your training, use the protective equipment provided, and report hazards, injuries, near misses and incidents immediately, as the Workers Compensation Act and the Occupational Health and Safety Regulation require. You must never bully, harass, threaten, discriminate against or retaliate against any person. You have the right to know about hazards, to take part in health and safety, to refuse unsafe work, and to raise a safety or care concern in good faith without reprisal.');
  P('29. Honesty and cooperation.', 'You must keep all records true, complete and on time, and you must never alter, backdate, falsify or destroy a record. You must answer truthfully and cooperate fully in any investigation or review by Evergreen, MCFD, CLBC, a licensing officer, WorkSafeBC or the police, and keep investigations confidential.');
  P('30. Professional boundaries.', `You must keep professional boundaries with the ${st.who} and their families, on and off shift and after a placement ends: no personal social media contact, no personal gifts, money, loans or purchases, no private contact outside work, and no personal, financial, romantic or sexual relationship. Any exception needs the Program Manager's prior written approval.`);
  P('31. Confidentiality and privacy.', `All information about the ${st.who}, their families, staff and Evergreen is confidential, during and after your employment. You will use it only for your work and only in Evergreen's systems, as the Freedom of Information and Protection of Privacy Act, the Personal Information Protection Act and our contracts require. You must not photograph, record, copy, post or share any image of, or information about, a person we support, or any Evergreen record or policy, except as your work requires. Evergreen's systems are monitored and access to records is logged.`);
  P('32. Fitness for work.', 'You must not report for or perform work while impaired by alcohol, cannabis or any drug. If a prescribed medication may affect your work, tell HR so that Evergreen can accommodate you.');
  P('33. Other employment.', 'You must disclose to HR any other employment or business that could create a conflict of interest or affect your rest, availability or safe care. You must arrive for each shift rested and fit to work.');
  P('34. Property.', 'All keys, fobs, devices, records and information belong to Evergreen and must be returned when asked and on your last day.');

  N.push({ h: 'Part I: Investigation, discipline and termination' });
  P('35. Administrative leave.', 'If an allegation or concern is raised about your conduct or the safety of a person we support, Evergreen may remove you from duty and place you on paid administrative leave while it investigates. You agree that administrative leave is not discipline, a termination or a change to your employment. You will be told the concerns, given a fair opportunity to respond, and may bring a support person to meetings.');
  P('36. Discipline.', 'Evergreen applies discipline fairly and in proportion to the conduct, which may include coaching, a Letter of Expectation, a written warning, a performance improvement plan, or, after an investigation, a suspension without pay of up to 5 scheduled shifts. Three Letters of Expectation within 24 months may lead to dismissal. Serious misconduct may lead directly to termination.');
  P('37. Resignation.', `You may resign by giving at least ${leader ? '4' : '2'} weeks' written notice. If Evergreen chooses to end your employment before your resignation date, it will pay you for the rest of your notice period, up to the amount the Act would require.`);
  P('38. Termination for just cause.', `Evergreen may end your employment for just cause, as that term is understood under the law of British Columbia, without notice or pay in place of notice. Depending on the circumstances, a single incident may be just cause. Examples include: abuse, neglect, exploitation or unsafe care of a person we support, or failing to report it; dishonesty, including falsifying records, medication records or time records, or misleading an investigation; bullying, harassment, sexual harassment, discrimination, threats or violence, or reprisal against a person who reported in good faith; theft or fraud; working while impaired; a serious breach of confidentiality, privacy or professional boundaries; abandoning a shift or ${st.whoFull}; and failing to make a disclosure required by section 22.`);
  P('39. Termination without cause.', 'Evergreen may end your employment without cause by giving you the written notice, pay in place of notice, or a combination of both, that the Employment Standards Act (British Columbia) requires, as amended from time to time, together with all wages, vacation pay and other amounts owing to you under that Act, and continuation of your benefits during the statutory notice period. You agree that these amounts are all that you are entitled to receive if your employment ends without cause, and that you are not entitled to any other notice, pay in place of notice or severance, including under the common law. If the Act ever requires more than this section provides, Evergreen will provide what the Act requires, and this section will be read so that it complies with the Act.');
  P('40. Temporary layoff.', "Evergreen's work depends on placements and contracts. If work is reduced, for example because a placement ends or a contract changes, Evergreen may temporarily lay you off or reduce your hours, as the Employment Standards Act permits (no more than 13 weeks in any 20-week period). Evergreen will offer you suitable work in another home first where it is available, and will give you reasonable notice of your recall date. If you do not return or respond when properly recalled, you will be treated as having resigned.");

  N.push({ h: 'Part J: General' });
  P('41. Employment standards and your rights.', 'Nothing in this Agreement gives you less than the Employment Standards Act, the Workers Compensation Act or the Human Rights Code requires. Where this Agreement gives you more, this Agreement applies.');
  P('42. Severability.', 'If any part of this Agreement is found to be invalid or unenforceable, it will be replaced by the minimum standard required by law, and the rest of the Agreement remains in full force.');
  P('43. Entire agreement and changes.', "This Agreement, its Schedules and Evergreen's policies are the entire agreement between you and Evergreen and replace any earlier discussions, promises or representations, spoken or written. Any change to this Agreement must be in writing and signed by an authorized officer of Evergreen.");
  P('44. Governing law.', 'This Agreement is governed by the laws of British Columbia and the federal laws of Canada that apply.');
  P('45. Independent advice and acceptance.', `You received this Agreement on ${longDay(dt.offer)}, at least 2 business days before signing it. By signing, you confirm that you have read and understood it, have had the opportunity to ask questions and to obtain independent legal advice, and sign it freely. This offer is open until ${longDay(dt.respondBy)}, and you must sign it before your start date of ${longDay(dt.start)}. If it is not signed by then, the offer expires.`);
  N.push({ p: `We look forward to welcoming you to the Evergreen team, ${first}.` });

  N.push({ sign: true });
  N.push({ pageBreak: true });
  N.push({ h: 'Schedule 1: Position details' });
  N.push({ table: [
    ['Employee', `${personName}${o.person_address ? `, ${o.person_address}` : ''}`],
    ['Position title', o.position], ['Classification', `${cls}${o.grid_level ? `, Grid ${o.grid_level}` : ''}`],
    ['Program stream', st.streamLabel], ['Category', `Permanent ${full ? 'full-time' : 'part-time'}, ${o.hours ?? ''}`],
    ['Shift team', 'Fixed day, evening or awake-night team, 8-hour shifts, every other weekend off'],
    ['Home base', home], ['Reports to', reports],
    ['Starting wage', `${$(o.wage)} per hour${o.grid_level ? ` (Grid ${o.grid_level}, Step 1)` : ''}`],
    ...(steps.length > 1 ? [['Wage steps', `${$(steps[1])} after 2,000 hours${steps[2] ? `; ${$(steps[2])} after 4,000 hours` : ''}`]] : []),
    ['Breaks', `No scheduled break; continuous paid duty; meals eaten on duty with the ${st.who}`],
    ['Criminal record check scope', st.scope],
    ['Certifications', "Standard First Aid with CPR; CPI or NVCI; medication administration; BC driver's licence, abstract and $2 million business-use insurance if driving"],
    ['References', 'Three professional references, all from supervisors'],
  ] });
  N.push({ h: 'Schedule 2: Key dates' });
  N.push({ head: ['Milestone', 'Rule', 'Date'], table: [
    ['Offer issued', 'Offer date', longDay(dt.offer)],
    ['Offer must be accepted by', 'At least 2 business days after the offer, and before the start date', longDay(dt.respondBy)],
    ['Start date', 'First paid day, including orientation', longDay(dt.start)],
    ['Statutory holiday eligibility', '30 calendar days employed (and 15 of 30 days worked)', longDay(dt.holidays)],
    ['30-day probation review', 'Start + 30 days', longDay(dt.review30)],
    ['60-day probation review', 'Start + 60 days', longDay(dt.review60)],
    ['80-day review and probation decision', 'Start + 80 days', longDay(dt.review80)],
    ['Probation ends', 'Start + 3 months, less 1 day', longDay(dt.probationEnds)],
    ['Benefits start (if eligible)', 'Day after probation ends', longDay(dt.benefits)],
    ['Paid sick days available', 'Start + 90 days', longDay(dt.sick)],
    ['Termination notice owed under the Act', '1 week after 3 months; 2 weeks after 1 year; 3 weeks after 3 years, plus 1 week a year to 8', `From ${longDay(dt.noticeFrom)}`],
    ['First vacation earned (2 weeks, 4%)', '12 months employed', longDay(dt.vacation1)],
    ...(steps.length > 1 ? [[`Wage Step 2 (${$(steps[1])})`, `After 2,000 hours worked${full ? ' (about 13 months full-time)' : ''}`, full ? `About ${monthYear(dt.step2About)}` : 'After 2,000 hours']] : []),
    ['Excellence Bonus review', '24 months', longDay(dt.bonus)],
    ['Criminal record check renewal', '5 years after the check date', '5 years after your check'],
    ['Vacation rises to 3 weeks, 6%', '5 consecutive years', longDay(dt.vacation5)],
  ] });
  return N;
}
