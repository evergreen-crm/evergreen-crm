// Evergreen Community Care — Organizational Divisions (ECC-DIV-2026-001, July 2026).
// Seven divisions, each with its areas. Every area has its own records page.
// staff: true  = front-line staff can see and add records in this area (their own house).
// resident: true = a record can be linked to one resident.
// dueDays = default due date (days after the record date) when none is entered.
// Field types: text, textarea, number, select, date, time, yesno.

const T = (name, label, extra = {}) => ({ name, label, type: 'text', ...extra });
const TA = (name, label, extra = {}) => ({ name, label, type: 'textarea', ...extra });
const S = (name, label, options, extra = {}) => ({ name, label, type: 'select', options, ...extra });
const D = (name, label, extra = {}) => ({ name, label, type: 'date', ...extra });
const N = (name, label, extra = {}) => ({ name, label, type: 'number', ...extra });
const YN = (name, label) => ({ name, label, type: 'yesno' });

export const MANUALS = [
  'RC Program Manual (ECC-RC-POL-2026-003)', 'HR Policy Binder (ECC-HR-POL-2026-001)',
  'OHS Program Binder (ECC-OHS-POL-2026-002)', 'QA Program Binder (ECC-QA-2026-001)',
  'Finance and Administration Manual (ECC-FA-2026-001)', 'PC Manual (ECC-PC-MAN-2026-001)',
  'PM Manual (ECC-PM-MAN-2026-001)', 'Organizational Divisions (ECC-DIV-2026-001)',
];

export const DIVISIONS = [
  // ===================================================================
  {
    key: 'governance', num: 1, icon: '🏛', title: 'Governance and leadership', color: '#0f3059',
    roles: 'Board of Directors · Executive Director',
    standards: 'MCFD Standard H.1 · H.2',
    docs: ['RC Program Manual v4', 'Finance Manual', 'All Policy Binders'],
    areas: [
      {
        key: 'board', title: 'Board of Directors', std: 'H.1 · WCA s.115',
        summary: 'Governance, policy approval, budget, financial oversight and accountability to MCFD and the public.',
        rules: ['Board meets at least quarterly', 'Annual program review is a standing agenda item', 'Emergency meeting within 48 hours of any serious incident with liability implications', 'Approves the OHS Program and annual OHS budget'],
        types: ['Regular quarterly meeting', 'Emergency meeting', 'Annual general meeting', 'Board resolution', 'Annual report received'],
        fields: [TA('attendees', 'Attendees'), TA('decisions', 'Decisions / motions'), TA('follow_up', 'Follow-up actions')],
      },
      {
        key: 'ed', title: 'Executive Director', std: 'H.1',
        summary: 'Ultimate operational accountability; MCFD contract authority; media; legal; Board reporting; signs policies.',
        rules: ['Only the ED signs employment offers, contracts and service agreements', 'Only the ED speaks to media and settles legal claims', 'ED gives Program Managers monthly reflective supervision', 'ED presents the quarterly KPI dashboard to the Board'],
        types: ['Contract / agreement signed', 'Policy signed', 'Capital approval', 'Media statement', 'Legal matter', 'Employment offer / termination', 'Board report', 'Other decision'],
        fields: [N('amount', 'Amount ($), if any', { step: '0.01' }), TA('details', 'Details')],
      },
      {
        key: 'strategy', title: 'Strategic planning and direction', std: 'H.1',
        summary: 'Annual priorities, service model, growth, funder relationships and reconciliation commitments.',
        rules: ['Priorities set by ED and Board each September', 'Budget developed September–November', 'Service model reviewed each July with the Annual Program Review', 'Reconciliation (TRC Call 65, DRIPA) progress reviewed yearly'],
        types: ['Annual priority', 'Reconciliation commitment', 'Growth / new program', 'Funder relationship'],
        fields: [T('owner', 'Owner'), S('progress', 'Progress', ['Not started', 'On track', 'At risk', 'Done']), TA('details', 'Details')],
      },
      {
        key: 'policy', title: 'Policy governance and review', std: 'H.2',
        summary: 'All policy manuals reviewed every July; staff sign acknowledgements within 30 days.',
        rules: ['Every manual reviewed annually in July', 'Changes communicated to affected staff within 30 days, with signed acknowledgement', 'MCFD and the Licensing Officer told of material policy changes'],
        types: ['Annual review', 'Amendment', 'Staff acknowledgement round', 'MCFD / Licensing notified'],
        dueDays: 30,
        fields: [S('manual', 'Policy document', MANUALS, { required: true }), T('version', 'New version'), TA('changes', 'What changed')],
      },
      {
        key: 'legal', title: 'Legal and regulatory compliance', std: 'CFCSA · CCALA · RCR · DRIPA · ESA · WCA',
        summary: 'Tracks law and regulation changes (CFCSA, CCALA, Residential Care Regulation, DRIPA, ESA, Workers Compensation Act, Human Rights Code).',
        rules: ['Review every legislative or MCFD Standards amendment', 'Update affected manuals and train staff'],
        types: ['Regulation change', 'Standards amendment', 'Legal advice', 'Legal claim'],
        fields: [S('law', 'Law / standard', ['CFCSA', 'CCALA', 'Residential Care Regulation', 'DRIPA', 'Employment Standards Act', 'Workers Compensation Act', 'Human Rights Code', 'FOIPPA', 'MCFD Standards (SHSS)', 'Other']), TA('impact', 'Impact and action needed')],
      },
    ],
  },
  // ===================================================================
  {
    key: 'program', num: 2, icon: '🏠', title: 'Program operations', color: '#0b5a34',
    roles: 'Program Manager · Program Coordinator · Youth Care Workers',
    standards: 'MCFD Standards A–F',
    docs: ['RC Program Manual v4', 'PM Manual', 'PC Manual', 'Orientation Manual'],
    areas: [
      {
        key: 'std-a', title: 'Program purpose and description', std: 'Standard A', staff: true,
        summary: 'Written Program Description, admission criteria, licensing compliance and capacity.',
        rules: ['Give the Program Description to each youth at admission and each new staff member at orientation', 'Review and update each July', 'Notify MCFD before any material program change', 'Staff sign the updated description within 30 days'],
        types: ['Program Description update', 'Given to youth at admission', 'Given to staff at orientation', 'Capacity / licence change'],
        resident: true,
        fields: [T('version', 'Version'), TA('notes', 'Notes')],
      },
      {
        key: 'std-b', title: 'Rights, complaints and privacy', std: 'Standard B', staff: true,
        summary: 'CFCSA s.70 rights, complaint resolution, FOIPPA, advocacy access (RCY 1-800-476-3933).',
        rules: ['Acknowledge a complaint the same shift', 'PC investigates within 5 business days and responds in writing within 10', 'Then PM, then ED (final internal level)', 'Never interfere with access to the Advocate, RCY, Ombudsperson, social worker or police — that is a Category 1 incident', 'Privacy breach reported to the PM within 24 hours'],
        types: ['Complaint', 'Privacy breach', 'Rights explained to youth', 'Advocate / RCY contact'],
        resident: true, dueDays: 10,
        fields: [S('from', 'From', ['Youth', 'Family', 'Staff', 'Social worker', 'Community', 'Other']), S('step', 'Step reached', ['1. Staff acknowledged (same shift)', '2. PC investigating (5 business days)', '3. PC written response (10 business days)', '4. PM investigation', '5. ED review (final)']), TA('details', 'What was raised'), TA('outcome', 'Outcome / response')],
      },
      {
        key: 'std-c', title: 'Personal safety', std: 'Standard C', staff: true,
        summary: 'Environmental safety, critical incidents, physical restraint, missing youth and self-harm protocols.',
        rules: ['Category 1 incident: verbal report within 2 hours, written within 24 hours', 'Category 2: next business day · Category 3: weekly', 'After hours: MCFD Centralized Screening 1-800-663-9122', 'Restraint is a last resort; prone restraint and seclusion are prohibited', 'Missing youth: Phase 1 search max 30 minutes, then MCFD, 911, PM, ED'],
        links: [{ label: 'Incident reports are on each resident’s Incidents tab', href: '/homes' }, { label: 'Dashboard — open incidents', href: '/dashboard' }],
        types: ['Missing youth log', 'Self-harm response', 'Environmental risk assessment', 'Safety plan review', 'Restraint review'],
        resident: true,
        fields: [T('time_line', 'Times (left / found / notified)'), TA('details', 'What happened and steps taken'), YN('mcfd_notified', 'MCFD notified')],
      },
      {
        key: 'std-d', title: 'Quality of service experiences', std: 'Standard D', staff: true,
        summary: 'Daily care, behaviour support, gender-affirming care, family involvement, community access and youth voice.',
        rules: ['Three meals and two snacks daily', 'Correct name and pronouns from Day 1', 'Family contact is a right — never withheld as a consequence', 'Prohibited: corporal punishment, seclusion, withholding meals, humiliation, threats of removal', 'Bath water max 42°C (37–38°C recommended)'],
        links: [{ label: 'Daily notes, logs and goals are on each resident’s page', href: '/homes' }],
        types: ['House meeting / youth voice', 'Family contact', 'Community activity', 'Cultural activity', 'Menu / nutrition review', 'Water temperature check'],
        resident: true,
        fields: [TA('details', 'Details'), T('youth_input', 'Youth’s own words / input')],
      },
      {
        key: 'std-e', title: 'Service planning (ISP)', std: 'Standard E', staff: true,
        summary: 'ISP development and review, care team coordination, Cultural Plans, transition planning, school and health.',
        rules: ['Preliminary ISP within 48 hours of admission; full ISP meeting within 14 days', 'Quarterly review minimum; emergency review within 5 business days of a Category 1 incident', 'Cultural Plan within 30 days for every Indigenous youth', 'Transition planning starts 60 days before discharge; discharge summary within 5 business days', 'School enrolment within 5 school days'],
        links: [{ label: 'Each resident’s Requirements tab tracks ISP / Cultural Plan due dates', href: '/homes' }],
        types: ['Preliminary ISP (48 hours)', 'Full ISP meeting (14 days)', 'Quarterly ISP review', 'Emergency ISP review', 'Cultural Plan', 'Transition plan', 'Discharge summary', 'School enrolment / IEP'],
        resident: true, dueDays: 91,
        fields: [TA('attendees', 'Care team present'), TA('summary', 'Summary / decisions'), YN('youth_signed', 'Youth signed / acknowledged')],
      },
      {
        key: 'std-f', title: 'Shelter and equipment', std: 'Standard F', staff: true,
        summary: 'Facility safety, hot water, fire safety, vehicles and maintenance.',
        rules: ['Monthly facility inspection; deficiencies: Priority 1 immediate, 2 within 48 hours, 3 within 14 days', 'Smoke/CO detectors, extinguishers and emergency lights checked monthly', 'Quarterly announced fire drill; yearly unannounced night/weekend drill', 'Hot water max 49°C at all taps', 'Vehicle pre-trip log and monthly check; driver’s abstract yearly'],
        links: [{ label: 'Fire drills and safety checks are on each house’s Safety tab', href: '/homes' }],
        types: ['Maintenance request', 'Deficiency', 'Hot water temperature', 'Vehicle check', 'Licence posted / renewed'],
        fields: [S('priority', 'Priority', ['1 — immediate', '2 — within 48 hours', '3 — within 14 days']), T('reading', 'Reading (e.g., 47°C, odometer)'), TA('details', 'Details / repair')],
      },
    ],
  },
  // ===================================================================
  {
    key: 'hr', num: 3, icon: '👥', title: 'Human resources', color: '#5a3d8a',
    roles: 'Executive Director · Program Manager · Program Coordinator',
    standards: 'MCFD Standard G · ESA · Human Rights Code',
    docs: ['HR Policy Binder v3', 'PM Manual — Part 8', 'PC Manual — Part 8'],
    areas: [
      {
        key: 'g1', title: 'Recruitment, screening and personnel files', std: 'Standard G.1',
        summary: 'CRC Vulnerable Sector, references, job descriptions, the 14-item personnel file, Indigenous hiring strategy.',
        rules: ['All 14 personnel file items verified by the PC within 30 days of hire; PM signs off', 'CRC Vulnerable Sector clearance before the first shift'],
        links: [{ label: 'Staff HR files (certificates, training)', href: '/hr' }],
        types: ['Job posting', 'Interview', 'Offer', 'Personnel file check (14 items)', 'CRC renewal'],
        dueDays: 30,
        fields: [T('person', 'Candidate / staff name', { required: true }), S('file_items', 'Personnel file', ['All 14 items complete', 'Items missing']), TA('notes', 'Notes / missing items')],
      },
      {
        key: 'g2', title: 'Staffing ratios and scheduling', std: 'Standard G.2',
        summary: 'Licensed minimums, emergency coverage, on-call, fatigue management, below-minimum protocol.',
        rules: ['Below minimum: shift lead tells PC immediately; PC tells PM', 'PM restores coverage within 2 hours', 'If not restored: tell the MCFD social worker and complete an incident report'],
        links: [{ label: 'Shift schedule', href: '/schedule' }, { label: 'Timesheets', href: '/timesheet' }],
        types: ['Below-minimum staffing', 'On-call coverage', 'Fatigue concern', 'Emergency coverage used'],
        fields: [T('shift', 'Shift / time'), TA('steps', 'Steps taken'), YN('mcfd_notified', 'MCFD notified')],
      },
      {
        key: 'g3', title: 'Training and development', std: 'Standard G.3',
        summary: 'NVCI, First Aid, Indigenous Cultural Safety, gender-affirming care (mandatory), ASIST, WHMIS, trauma-informed practice.',
        rules: ['OHS orientation Day 1; youth rights before first solo shift', 'First Aid / CPR within 30 days; NVCI full certification within 90 days', 'Indigenous Cultural Safety, gender-affirming care and LGBTQ2S+ inclusion within 60 days, then yearly', 'Training matrix updated by the 5th of each month'],
        links: [{ label: 'Staff training records', href: '/hr' }],
        types: ['Training session held', 'Monthly training matrix update', 'Training lapse — staff removed from duty'],
        fields: [T('course', 'Course'), TA('attendees', 'Who attended'), N('hours', 'Hours', { step: '0.5' })],
      },
      {
        key: 'g4', title: 'Supervision and support', std: 'Standard G.4',
        summary: 'Monthly reflective supervision, probation reviews, performance evaluations, secondary traumatic stress support.',
        rules: ['All direct-care staff: monthly supervision', 'New staff (first 90 days) and staff on a PIP: every 2 weeks', 'Annual written performance evaluation', 'Debrief offered within 48 hours of a significant incident'],
        types: ['Monthly supervision', 'Bi-weekly supervision (new / PIP)', 'Probation review', 'Annual evaluation', 'Post-incident debrief'],
        dueDays: 30,
        fields: [T('person', 'Staff member', { required: true }), T('supervisor', 'Supervisor'), TA('notes', 'Discussion and goals')],
      },
      {
        key: 'discipline', title: 'Performance management and discipline', std: 'HR Policy Binder',
        summary: 'Progressive discipline steps 1–4, PIPs, grievance procedure, termination (ED + HR authority).',
        rules: ['Grievance: written to supervisor within 20 business days; responses within 10 business days at each step', 'Only the ED terminates employment'],
        types: ['Step 1 — verbal warning', 'Step 2 — written warning', 'Step 3 — suspension', 'Step 4 — termination', 'Performance improvement plan', 'Grievance'],
        fields: [T('person', 'Staff member', { required: true }), TA('details', 'Details'), D('review_on', 'Review date')],
      },
      {
        key: 'comp', title: 'Compensation, benefits and leaves', std: 'ESA',
        summary: 'Wage grid, shift premiums, ESA leaves, EFAP, professional development ($500 per FTE yearly), overtime and lieu time.',
        rules: ['Leaves follow the BC Employment Standards Act', 'Professional development fund: $500 per FTE per year'],
        types: ['Leave request', 'Wage change', 'Overtime / lieu', 'Professional development', 'Benefits enrolment'],
        fields: [T('person', 'Staff member', { required: true }), D('from', 'From'), D('to', 'To'), N('amount', 'Amount ($)', { step: '0.01' }), TA('notes', 'Notes')],
      },
    ],
  },
  // ===================================================================
  {
    key: 'finance', num: 4, icon: '💰', title: 'Finance and administration', color: '#8a5a00',
    roles: 'Executive Director · Program Manager',
    standards: 'MCFD Standard H.1',
    docs: ['Finance and Administration Manual', 'PM Manual — Part 9'],
    areas: [
      {
        key: 'h1', title: 'MCFD financial compliance', std: 'Standard H.1',
        summary: 'GAAP accounting, annual budget, monthly financial statements, annual financial report to MCFD.',
        rules: ['Monthly statements reviewed by the PM within 5 business days', 'PM explains in writing any variance over 10%', 'Annual financial report submitted by the ED on time'],
        types: ['Monthly statements reviewed', 'Variance explanation', 'Annual financial report'],
        dueDays: 5,
        fields: [T('period', 'Period (e.g., Sept 2026)'), N('variance', 'Largest variance (%)', { step: '0.1' }), TA('notes', 'Explanation')],
      },
      {
        key: 'authority', title: 'Signing and delegated authority', std: 'Finance Manual',
        summary: 'Two-signature principle, delegated limits by role (YCW → PC → PM → ED → Board), conflict of interest.',
        rules: ['Two signatures on payments', 'Stay within your delegated limit', 'Declare any conflict of interest'],
        types: ['Approval', 'Conflict of interest declared', 'Limit change'],
        fields: [N('amount', 'Amount ($)', { step: '0.01' }), S('approver', 'Approved by', ['PC', 'PM', 'ED', 'Board']), T('second', 'Second signature'), TA('details', 'What for')],
      },
      {
        key: 'budget', title: 'Budget development and monitoring', std: 'Finance Manual',
        summary: 'Annual budget cycle (September–November), monthly variance reporting, contingency reserve, amendments.',
        rules: ['September: PM program budget · Oct/Nov: ED consolidates · December: Board approves · Jan 1: new year', 'Adverse variances escalated to the ED within 5 business days'],
        types: ['Program budget submission', 'Consolidated budget', 'Board approval', 'Budget amendment'],
        fields: [T('year', 'Fiscal year'), N('amount', 'Total ($)', { step: '0.01' }), TA('notes', 'Notes')],
      },
      {
        key: 'contracts', title: 'MCFD and CLBC contract revenue', std: 'Service Agreements',
        summary: 'Per-diem and block funding, deferred funding, contract renewals and occupancy tracking.',
        rules: ['Start contract renewal 6 months before expiry', 'Track occupancy against contracted beds'],
        types: ['MCFD contract', 'CLBC contract', 'Renewal', 'Per-diem / invoice', 'Occupancy report'],
        fields: [T('contract_no', 'Contract number'), D('start', 'Start'), D('end', 'End'), N('amount', 'Value ($)', { step: '0.01' }), N('beds', 'Beds')],
      },
      {
        key: 'payroll', title: 'Payroll, purchasing and petty cash', std: 'Finance Manual', staff: true,
        summary: 'Bi-weekly payroll, purchasing controls, petty cash per house, receipts and expense reimbursement.',
        rules: ['Receipts for every purchase, submitted within 5 business days', 'No verbal commitments above petty cash without written approval'],
        links: [{ label: 'Timesheets', href: '/timesheet' }, { label: 'Resident money logs are on each resident’s Money tab', href: '/homes' }],
        types: ['Petty cash purchase', 'Expense claim', 'Purchase order', 'Payroll run', 'Petty cash count'],
        fields: [N('amount', 'Amount ($)', { step: '0.01' }), YN('receipt', 'Receipt attached / kept'), TA('details', 'What for')],
      },
      {
        key: 'insurance', title: 'Insurance and assets', std: 'Finance Manual',
        summary: 'General liability, professional liability, D&O, vehicles (ICBC), property; annual review.',
        rules: ['All policies confirmed every July', 'Any gap or lapse reported to the ED immediately'],
        types: ['General liability', 'Professional liability (E&O)', 'Directors & Officers', 'Vehicle (ICBC)', 'Property / contents', 'Volunteer liability', 'Asset purchase / disposal'],
        fields: [T('insurer', 'Insurer / vendor'), T('policy_no', 'Policy / asset number'), N('amount', 'Premium / value ($)', { step: '0.01' })],
      },
    ],
  },
  // ===================================================================
  {
    key: 'qa', num: 5, icon: '📊', title: 'Quality assurance', color: '#00687a',
    roles: 'Executive Director · Program Manager · Program Coordinator',
    standards: 'MCFD Standard H.2',
    docs: ['QA Program Binder', 'PM Manual — Part 9', 'PC Manual — Part 9'],
    areas: [
      {
        key: 'kpi', title: 'Key performance indicators', std: 'QA Binder s.5.3', kpi: true,
        summary: 'Safety, compliance and quality KPIs — calculated live from the records in this portal.',
        rules: ['Reviewed quarterly at the ED–PM operations meeting', 'Presented to the Board quarterly'],
        types: ['Quarterly KPI review', 'Board KPI report'],
        fields: [TA('notes', 'Discussion and actions')],
      },
      {
        key: 'tool-a', title: 'MCFD Standards self-assessment (Tool A)', std: 'Standards A–H',
        summary: 'Annual Standards A–H compliance review rated Met / Partial / Not Met with a corrective action plan.',
        rules: ['Every July, PM + ED'],
        types: ['Standard A', 'Standard B', 'Standard C', 'Standard D', 'Standard E', 'Standard F', 'Standard G', 'Standard H'],
        fields: [S('rating', 'Rating', ['Met', 'Partially met', 'Not met'], { required: true }), TA('evidence', 'Evidence'), TA('action', 'Corrective action')],
      },
      {
        key: 'tool-b', title: 'Monthly facility safety inspection (Tool B)', std: 'Standard F', staff: true,
        summary: 'Fire safety, physical environment, health and safety equipment, medication and records.',
        rules: ['First week of every month by the PC', 'Every deficiency gets a priority, owner and target date', 'PM signs off within 5 business days'],
        types: ['Monthly inspection'],
        dueDays: 5,
        fields: [S('result', 'Result', ['No deficiencies', 'Deficiencies found']), N('p1', 'Priority 1 deficiencies'), N('p2', 'Priority 2'), N('p3', 'Priority 3'), TA('details', 'Deficiencies, owners and target dates'), YN('pm_signed', 'PM signed off')],
      },
      {
        key: 'tool-c', title: 'Critical incident trend analysis (Tool C)', std: 'Standard C',
        summary: 'Quarterly: incidents by type, youth, time and staff; restraint trend; year-over-year comparison.',
        rules: ['Every quarter by the PM', 'Corrective actions added to the Corrective Action Log'],
        links: [{ label: 'Live incident numbers on the KPI page', href: '/portal/qa/kpi' }],
        types: ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Oct–Dec)'],
        fields: [N('total', 'Total incidents'), N('restraints', 'Restraints'), TA('patterns', 'Patterns found'), TA('actions', 'Corrective actions')],
      },
      {
        key: 'tool-d', title: 'Resident file audit (Tool D)', std: 'Standard E',
        summary: 'Twice a year: ISP quality, youth voice, Cultural Plans, safety plans, documentation; minimum 25% sample.',
        rules: ['Bi-annual', 'At least 25% of files sampled'],
        types: ['Spring audit', 'Fall audit'],
        resident: true,
        fields: [N('files', 'Files audited'), N('score', 'Compliance (%)'), TA('findings', 'Findings'), TA('actions', 'Corrective actions')],
      },
      {
        key: 'monthly-qa', title: 'Monthly QA review', std: 'QA calendar',
        summary: 'Monthly QA Review Tool (by the 10th) and PM review of all QA reports and incident logs (by the 20th).',
        rules: ['Training matrix by the 5th · Safety inspection first week · QA review to PM by the 10th · PM review by the 20th', 'Quarterly all-staff meeting'],
        types: ['Monthly QA Review Tool', 'PM monthly review', 'Quarterly all-staff meeting'],
        fields: [T('month', 'Month'), TA('notes', 'Notes')],
      },
      {
        key: 'cap', title: 'Corrective action log', std: 'QA Binder',
        summary: 'Every corrective action from inspections, audits, incidents and reviews — owner, target date and status.',
        rules: ['Target: 90% completed by the target date'],
        types: ['From inspection', 'From audit', 'From incident review', 'From licensing', 'From complaint', 'Other'],
        fields: [T('owner', 'Owner', { required: true }), TA('action', 'Action', { required: true })],
      },
      {
        key: 'h2', title: 'Annual program review', std: 'Standard H.2',
        summary: 'Service relevance, care plan goal attainment, program goals, resources and policy currency — July cycle.',
        rules: ['Every July, led by the ED; all seven divisions take part', 'Includes youth, family and staff satisfaction surveys'],
        types: ['Annual program review', 'Youth satisfaction survey', 'Family satisfaction survey', 'Staff satisfaction survey'],
        fields: [TA('findings', 'Findings'), TA('actions', 'Actions for next year')],
      },
    ],
  },
  // ===================================================================
  {
    key: 'ohs', num: 6, icon: '🦺', title: 'OHS and workplace safety', color: '#b3261e',
    roles: 'Board · ED · PM · Health and Safety Coordinator · JHSC',
    standards: 'Workers Compensation Act · OHS Regulation',
    docs: ['OHS Program Binder', 'PM Manual — Part 10', 'PC Manual — Part 10'],
    areas: [
      {
        key: 'jhsc', title: 'Joint Health and Safety Committee', std: 'WCA s.125',
        summary: 'Monthly meetings, inspections, incident investigations, work refusals; management responds within 21 days.',
        rules: ['Meets monthly; quorum = 1 worker + 1 management rep', 'Minutes posted within 7 days, kept 2 years', 'Management answers every recommendation in writing within 21 days', 'Emergency meeting within 48 hours of a serious injury'],
        types: ['Monthly meeting', 'Recommendation to management', 'Management response', 'Workplace inspection', 'Work refusal'],
        dueDays: 21,
        fields: [TA('attendees', 'Present'), TA('details', 'Minutes / recommendation'), TA('response', 'Management response')],
      },
      {
        key: 'hazards', title: 'Hazard identification and risk assessment', std: 'OHS Reg.', staff: true,
        summary: 'Environmental and workplace violence risk assessments, WHMIS, working alone.',
        rules: ['Violence risk assessment every July and after any serious violent incident', 'SDS binder updated within 30 days of any product change', 'Working-alone check-in procedure for solo shifts'],
        types: ['Violence risk assessment', 'Environmental risk assessment', 'WHMIS / SDS update', 'Working alone assessment', 'Hazard report'],
        fields: [S('risk', 'Risk level', ['Low', 'Medium', 'High']), TA('details', 'Hazard and controls')],
      },
      {
        key: 'safe-work', title: 'Safe work procedures', std: 'OHS Program', staff: true,
        summary: 'De-escalation safety, medication handling, infection control, bodily fluid exposure, night monitoring, personal care.',
        rules: ['Staff review and sign each procedure at orientation and yearly'],
        types: ['Procedure reviewed with staff', 'Procedure updated', 'Exposure incident'],
        fields: [S('procedure', 'Procedure', ['De-escalation safety', 'Medication handling', 'Infection control', 'Blood / bodily fluid exposure', 'Night-time monitoring', 'Personal care assistance', 'Working alone', 'Other']), TA('details', 'Details / staff')],
      },
      {
        key: 'worksafe', title: 'Worker incidents and WorkSafeBC', std: 'WCA s.150, 172', staff: true,
        summary: 'Staff injuries and near misses, investigations, WorkSafeBC reporting.',
        rules: ['Serious incidents: phone WorkSafeBC immediately (1-888-621-7233)', 'Investigation within 24 hours; report within 48 hours; PM co-signs', 'Form 7 within 3 business days of an injury claim'],
        types: ['Injury', 'Near miss', 'Exposure', 'Violence toward worker', 'WorkSafeBC inspection / order'],
        dueDays: 3,
        fields: [T('worker', 'Worker'), TA('details', 'What happened'), YN('first_aid', 'First aid given'), YN('lost_time', 'Lost time'), YN('form7', 'Form 7 / WorkSafeBC report sent')],
      },
      {
        key: 'rtw', title: 'Workplace violence prevention and return to work', std: 'WCA',
        summary: 'Post-incident debrief, modified duty, return-to-work plans, secondary traumatic stress support.',
        rules: ['Return-to-work plan started within 48 hours of a work injury', 'Supportive contact at least every 2 weeks while on leave', 'No pressure or penalty for filing a WorkSafeBC claim'],
        types: ['Post-incident debrief', 'Return-to-work plan', 'Modified duty', 'Check-in while on leave'],
        dueDays: 2,
        fields: [T('worker', 'Worker', { required: true }), TA('details', 'Plan / notes')],
      },
    ],
  },
  // ===================================================================
  {
    key: 'external', num: 7, icon: '🤝', title: 'External relations', color: '#4a5a6a',
    roles: 'Executive Director · Program Manager',
    standards: 'MCFD · CCALA · DRIPA',
    docs: ['RC Program Manual v4', 'PM Manual — Parts 2–3, 9', 'Finance Manual'],
    areas: [
      {
        key: 'mcfd', title: 'MCFD contract management', std: 'Service Agreement',
        summary: 'Contract Manager relationship, reporting deadlines, monitoring visits, placement authorizations, renewal.',
        rules: ['Monthly incident trend summary; quarterly program update; annual review submission', 'Facilitate monitoring visits promptly; never delay or obstruct', 'Contract renewal starts 6 months before expiry'],
        types: ['Monthly report sent', 'Quarterly update sent', 'Monitoring visit', 'Placement authorization', 'Contract renewal'],
        resident: true,
        fields: [T('contact', 'MCFD contact'), TA('details', 'Details / findings')],
      },
      {
        key: 'licensing', title: 'Health Authority licensing', std: 'CCALA',
        summary: 'Licensing Officer relationship, inspections, deficiency response, licence renewal (90 days before).',
        rules: ['Written corrective action plan within the inspection report’s timeline', 'Priority 1 deficiencies fixed immediately', 'Start licence renewal 90 days before expiry'],
        types: ['Inspection', 'Deficiency', 'Corrective action plan sent', 'Licence renewal', 'Change notification'],
        fields: [T('officer', 'Licensing Officer'), TA('details', 'Findings / actions')],
      },
      {
        key: 'indigenous', title: 'Indigenous community and Nation relations', std: 'DRIPA', staff: true,
        summary: 'Nation notification, DAA partnerships, Cultural Plans, Friendship Centre connections, TRC Calls to Action.',
        rules: ['Nation notified Day 1 of an Indigenous youth’s admission', 'Cultural Plan within 30 days, built with youth, family and Nation', 'Smudging, ceremony, traditional foods and dress accommodated without restriction'],
        types: ['Nation notification', 'DAA meeting', 'Elder / cultural mentor visit', 'Ceremony / cultural event', 'Friendship Centre connection'],
        resident: true,
        fields: [T('nation', 'Nation / community / DAA'), TA('details', 'Details')],
      },
      {
        key: 'partners', title: 'Community and service partners', std: 'Standard E', staff: true,
        summary: 'School districts, health authorities, mental health, cultural organizations, employment programs, Foundry.',
        rules: ['GP or NP within 30 days of admission', 'Mental health services connected within 30 days of identification', 'PM or PC attends all IEP reviews'],
        types: ['School district', 'Health / GP', 'Mental health', 'Cultural organization', 'Employment program', 'Foundry', 'Other partner'],
        resident: true,
        fields: [T('org', 'Organization / contact'), T('phone', 'Phone / email'), TA('details', 'Details')],
      },
      {
        key: 'oversight', title: 'RCY, Ombudsperson and oversight bodies', std: 'Standard B', staff: true,
        summary: 'Unrestricted youth access to the RCY (1-800-476-3933) and Ombudsperson; full co-operation with oversight.',
        rules: ['Never restrict or delay a youth’s contact with the RCY or Ombudsperson', 'Preserve records; never alter them before an investigation'],
        types: ['RCY contact', 'Ombudsperson', 'OIPC (privacy)', 'WorkSafeBC', 'Other oversight'],
        resident: true,
        fields: [TA('details', 'Details')],
      },
      {
        key: 'media', title: 'Media, legal and public communications', std: 'FOIPPA',
        summary: 'ED-only media authority, legal counsel, no disclosure of a youth’s care status.',
        rules: ['Only the ED speaks to media', 'Never confirm or deny that a youth is in care', 'Public responses follow FOIPPA'],
        types: ['Media inquiry', 'Legal counsel', 'Public inquiry', 'Social media'],
        fields: [T('from', 'From'), TA('details', 'Details and response')],
      },
    ],
  },
];

export const STATUSES = ['Open', 'In progress', 'Complete', 'N/A'];
export const isDone = (r) => r.status === 'Complete' || r.status === 'N/A';

export function findDivision(key) { return DIVISIONS.find((d) => d.key === key); }
export function findArea(divKey, areaKey) {
  const div = findDivision(divKey);
  return div ? { div, area: div.areas.find((a) => a.key === areaKey) } : {};
}
export function canSeeArea(area, role) { return ['admin', 'manager'].includes(role) || (role === 'staff' && !!area.staff); }
