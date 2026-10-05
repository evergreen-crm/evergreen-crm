// Intake form templates, built from Evergreen's own manuals:
//   RC Program Manual v4 §7.1 (Standard E.1 Eligibility & Intake) and §16 (Admission, Intake, Orientation)
//   Health Care & Consent Manual ECC-HC-2026-001 Appendices A, B, C, G
//   PM Manual Appendix B (Admission Decision Record)
// Each form is filled in and signed online by the person it is sent to.
// Field types: text, textarea, date, email, tel, select, radio, check (single tick box).

const t = (name, label, extra = {}) => ({ name, label, type: 'text', ...extra });
const ta = (name, label, extra = {}) => ({ name, label, type: 'textarea', ...extra });
const d = (name, label, extra = {}) => ({ name, label, type: 'date', ...extra });
const sel = (name, label, options, extra = {}) => ({ name, label, type: 'select', options, ...extra });
const radio = (name, label, options, extra = {}) => ({ name, label, type: 'radio', options, ...extra });
const chk = (name, label, extra = {}) => ({ name, label, type: 'check', ...extra });
const R = { required: true };

export const SIGNER_ROLES = [
  'MCFD social worker', 'DAA social worker', 'CLBC facilitator / analyst', 'Parent / guardian',
  'Family member', 'Representative (s.7 / s.9)', 'Committee of person', 'Youth', 'Adult (self)',
  'Program Manager', 'Other',
];

export const INTAKE_FORMS = [
  // ------------------------------------------------------------------ MCFD
  {
    key: 'mcfd_referral',
    code: 'ECC-INT-M1',
    title: 'MCFD Referral & Placement Information',
    stream: 'MCFD',
    signer: 'MCFD social worker',
    source: 'RC Program Manual v4 §7.1 (SHSS E.1) and §16.1',
    intro: 'Please complete this referral so Evergreen Community Care can confirm the placement is suited to the child or youth’s needs and best interests (MCFD Standard E.1). Information is shared only with authorized persons.',
    sections: [
      { title: 'Child / youth', fields: [
        t('legal_name', 'Legal name', R), t('preferred_name', 'Preferred name'), t('pronouns', 'Pronouns'),
        d('dob', 'Date of birth', R), t('phn', 'Personal Health Number (PHN)'),
        sel('legal_status', 'Legal status', ['CCO', 'TCO', 'Interim order', 'VCA', 'SNA', 'YAG', 'Other'], R),
        t('legal_status_other', 'If other, describe'),
      ] },
      { title: 'Referring social worker', fields: [
        t('sw_name', 'Name', R), sel('sw_agency', 'Agency', ['MCFD', 'Delegated Aboriginal Agency (DAA)'], R),
        t('sw_office', 'Office / team'), t('sw_phone', 'Phone', { ...R, type: 'tel' }), t('sw_email', 'Email', { ...R, type: 'email' }),
        t('sw_team_leader', 'Team leader name and phone'), t('after_hours', 'After-hours contact', { placeholder: 'e.g., 1-800-663-9122' }),
      ] },
      { title: 'Placement', fields: [
        radio('placement_type', 'Type of placement', ['Planned', 'Emergency', 'Respite'], R),
        d('requested_start', 'Requested start date', R), t('expected_length', 'Expected length of placement'),
        ta('reason', 'Reason for referral and goals of placement', R),
        ta('living_arrangement', 'Current living arrangement and previous placements'),
      ] },
      { title: 'Family, culture and identity', fields: [
        radio('indigenous', 'Is the child / youth Indigenous?', ['Yes', 'No', 'Unknown'], R),
        t('nation', 'Nation / community affiliation (if Indigenous)'), t('daa', 'DAA involved (if any)'),
        ta('family', 'Family members and important relationships'),
        ta('contact_plan', 'Family contact plan — who, how often, supervised or not'),
        ta('culture_language', 'Cultural, spiritual and language needs'),
        ta('gender_identity', 'Gender identity / expression supports the youth has asked for'),
      ] },
      { title: 'Legal', fields: [
        ta('court_orders', 'Court orders, no-contact orders or contact restrictions (attach copies to email)'),
        ta('youth_justice', 'Youth justice involvement / probation conditions'),
      ] },
      { title: 'Health', fields: [
        ta('allergies', 'Known allergies and reactions (write “None known” if none)', R),
        ta('conditions', 'Diagnoses and health conditions'), ta('medications', 'Current medications (name, dose, prescriber)'),
        t('physician', 'Family physician / NP and clinic'), t('dentist', 'Dentist'),
        ta('mental_health', 'Mental health supports / counsellor'),
      ] },
      { title: 'Education', fields: [
        t('school', 'School and grade'), radio('iep', 'Individual Education Plan (IEP)?', ['Yes', 'No', 'Unknown']),
        ta('education_notes', 'Attendance, learning needs, school contacts'),
      ] },
      { title: 'Behaviour and safety', fields: [
        ta('strengths', 'Strengths, interests and what helps the youth feel safe', R),
        ta('behaviours', 'Behaviours of concern, triggers and what helps de-escalate'),
        ta('risks', 'Safety risks (self-harm, running away, exploitation, substance use, aggression)'),
        ta('safety_plan', 'Existing safety plan or behaviour support plan (attach if available)'),
      ] },
      { title: 'Belongings', fields: [ ta('belongings', 'Personal belongings coming with the youth (transfer of belongings)') ] },
    ],
    attest: 'I confirm I am the referring social worker (or authorized delegate), the referral is authorized by MCFD / the DAA, and the information is accurate to the best of my knowledge.',
  },
  {
    key: 'routine_health_consent',
    code: 'ECC-INT-M2',
    title: 'Standing Routine Health Care Authorization',
    stream: 'MCFD',
    signer: 'MCFD social worker',
    source: 'Health Care & Consent Manual ECC-HC-2026-001 §13, Appendix B',
    intro: 'Evergreen staff are never the consent authority for a child or youth’s health care. This authorization covers routine care only and is renewed every 12 months. Anything outside the scope below needs separate consent from you before it happens.',
    sections: [
      { title: 'Child / youth', fields: [ t('legal_name', 'Legal name', R), d('dob', 'Date of birth', R), t('phn', 'PHN') ] },
      { title: 'Routine care authorized', fields: [
        chk('rc_checkups', 'Scheduled check-ups and minor illness visits'),
        chk('rc_dental', 'Dental exams, cleanings, routine x-rays and routine fillings'),
        chk('rc_immunizations', 'Routine immunizations on the BC schedule'),
        chk('rc_vision', 'Vision and hearing screening'),
        chk('rc_labs', 'Lab work ordered within routine care'),
        chk('rc_otc', 'Over-the-counter medications per Evergreen’s medication policy'),
        ta('limits', 'Conditions or limits on this authorization'),
      ] },
      { title: 'Contacts for non-routine consent', fields: [
        t('consent_contact', 'Who to contact for non-routine consent (name, phone)', R),
        t('consent_after_hours', 'After-hours contact for consent'),
      ] },
    ],
    attest: 'As the person with authority for this child / youth’s routine health care, I authorize the routine care ticked above for 12 months from today, within the limits stated.',
  },
  {
    key: 'infants_act_info',
    code: 'ECC-INT-M3',
    title: 'Youth Health Care & Confidentiality Preferences',
    stream: 'MCFD',
    signer: 'Youth',
    source: 'Health Care & Consent Manual ECC-HC-2026-001 Appendix G (Infants Act s.17)',
    intro: 'This is about you. In BC, a doctor or nurse can accept your own consent to health care if they decide you understand it (Infants Act s.17). Tell us how you like to be supported. Your safety is always our first priority.',
    sections: [
      { title: 'About you', fields: [ t('legal_name', 'Your name', R), t('preferred_name', 'Name you like to be called'), t('pronouns', 'Your pronouns') ] },
      { title: 'Your health care', fields: [
        ta('support_at_appointments', 'How would you like staff to support you at appointments?'),
        radio('staff_in_room', 'Do you want a staff member in the room with you?', ['Yes', 'No', 'Ask me each time']),
        ta('confidential', 'Is there health information you want kept private? (We still must report if someone is unsafe.)'),
        ta('important', 'Anything else you want us to know about your health or body?'),
      ] },
    ],
    attest: 'I have read this (or had it explained to me) and these are my own choices.',
  },

  // ------------------------------------------------------------------ CLBC
  {
    key: 'clbc_referral',
    code: 'ECC-INT-C1',
    title: 'CLBC Referral & Support Information',
    stream: 'CLBC',
    signer: 'CLBC facilitator / analyst',
    source: 'RC Program Manual v4 §7.1 (intake & assessment); 1–2 Bed Home Binder',
    intro: 'Please complete this referral so Evergreen Community Care can plan supports that fit the person’s needs, goals and preferences.',
    sections: [
      { title: 'Person supported', fields: [
        t('legal_name', 'Legal name', R), t('preferred_name', 'Preferred name'), t('pronouns', 'Pronouns'),
        d('dob', 'Date of birth', R), t('phn', 'Personal Health Number (PHN)'),
        t('pwd', 'PWD / income support status'),
      ] },
      { title: 'CLBC contact', fields: [
        t('fac_name', 'Facilitator / analyst name', R), t('fac_office', 'CLBC office'),
        t('fac_phone', 'Phone', { ...R, type: 'tel' }), t('fac_email', 'Email', { ...R, type: 'email' }),
      ] },
      { title: 'Service', fields: [
        sel('service_type', 'Service requested', ['Staffed residential', 'Shared living / home share', 'Respite', 'Community inclusion', 'Other'], R),
        d('requested_start', 'Requested start date', R), ta('reason', 'Reason for referral and goals', R),
        ta('current_living', 'Current living situation and supports'),
      ] },
      { title: 'Decision-making', fields: [
        radio('instrument', 'Decision-making instruments in place', ['None', 'Representation agreement s.7', 'Representation agreement s.9', 'Committee of person', 'Advance directive'], R),
        t('rep_contact', 'Representative / committee name and phone'),
      ] },
      { title: 'Support needs', fields: [
        ta('communication', 'Communication style and supports (visual, plain language, AAC, interpreter)', R),
        ta('daily_living', 'Daily living support needs (personal care, meals, mobility)'),
        ta('health', 'Health conditions, allergies and current medications'),
        ta('behaviour', 'Behaviour support needs, triggers and what helps'),
        ta('risks', 'Safety risks and existing safety / support plans (attach if available)'),
      ] },
      { title: 'Life and relationships', fields: [
        ta('strengths', 'Strengths, interests and what a good day looks like', R),
        ta('relationships', 'Important people and how often they want contact'),
        ta('culture', 'Cultural, spiritual and language needs'),
        ta('day_program', 'Day program, work or school'),
      ] },
    ],
    attest: 'I confirm I am the CLBC contact for this person and the information is accurate to the best of my knowledge.',
  },
  {
    key: 'tsdm_contacts',
    code: 'ECC-INT-C2',
    title: 'Health Care Decision Contacts (TSDM)',
    stream: 'CLBC',
    signer: 'Family member',
    source: 'Health Care & Consent Manual ECC-HC-2026-001 Appendix C (HCCCFAA s.16)',
    intro: 'If the adult cannot make a health care decision, the health care provider (not Evergreen) chooses a Temporary Substitute Decision Maker in the order set by BC law. Please list the people in each category so the provider can reach them quickly.',
    sections: [
      { title: 'Adult', fields: [ t('legal_name', 'Adult’s legal name', R), d('dob', 'Date of birth') ] },
      { title: 'Contacts in BC law order (s.16) — name, phone, last contact', fields: [
        t('c1_spouse', '1. Spouse (incl. marriage-like)'), t('c2_children', '2. Adult child(ren)'),
        t('c3_parents', '3. Parent(s)'), t('c4_siblings', '4. Sibling(s)'), t('c5_grandparents', '5. Grandparent(s)'),
        t('c6_grandchildren', '6. Grandchild(ren)'), t('c7_relative', '7. Other relative (birth / adoption)'),
        t('c8_friend', '8. Close friend(s)'), t('c9_marriage', '9. Related by marriage'),
      ] },
      { title: 'Higher-ranking authorities', fields: [ ta('higher', 'Committee / representative (s.7 / s.9) / advance directive — names and contacts') ] },
    ],
    attest: 'I confirm these contacts are correct to the best of my knowledge.',
  },
  {
    key: 'adult_preferences',
    code: 'ECC-INT-C3',
    title: 'My Supports & Health Care Participation Plan',
    stream: 'CLBC',
    signer: 'Adult (self)',
    source: 'Health Care & Consent Manual ECC-HC-2026-001 §21, Appendix A',
    intro: 'This is your plan. You decide your own health care when you are able to. Tell us how you like to get information and who you want involved.',
    sections: [
      { title: 'About you', fields: [ t('legal_name', 'Your name', R), t('preferred_name', 'Name you like to be called'), t('pronouns', 'Your pronouns') ] },
      { title: 'How I like support', fields: [
        ta('info', 'How I like to get information (pictures, simple words, someone I trust explains)'),
        t('supporter', 'Who I want with me at appointments'),
        ta('good_day', 'What a good day looks like for me'),
        ta('dislikes', 'Things I don’t like or that upset me'),
        ta('goals', 'My goals'),
      ] },
    ],
    attest: 'These are my choices. I had help to fill this in if I needed it.',
  },

  // ------------------------------------------------------------------ Both
  {
    key: 'health_profile',
    code: 'ECC-INT-B1',
    title: 'Individual Health Care Profile',
    stream: 'Both',
    signer: 'Parent / guardian',
    source: 'Health Care & Consent Manual ECC-HC-2026-001 Appendix A',
    intro: 'This profile helps staff keep the person healthy and safe. Allergies are shown prominently on the person’s file.',
    sections: [
      { title: 'Person', fields: [
        t('legal_name', 'Legal name', R), t('preferred_name', 'Preferred name'), d('dob', 'Date of birth', R),
        t('phn', 'Personal Health Number (PHN)'), t('pharmacare', 'PharmaCare plan'),
      ] },
      { title: 'Health', fields: [
        ta('allergies', 'KNOWN ALLERGIES AND REACTIONS (write “None known” if none)', R),
        ta('conditions', 'Diagnoses and health conditions'),
        ta('medications', 'Current medications (name, dose, time, prescriber)'),
        ta('communication', 'Communication and support needs for health care (plain language, visual supports, supporter present, sensory needs, interpreter)'),
        ta('cultural', 'Religious / cultural considerations for health care'),
      ] },
      { title: 'Providers', fields: [
        t('prescriber', 'Primary care prescriber — name, clinic, phone'), t('dentist', 'Dentist — name, clinic, phone'),
        t('optometrist', 'Optometrist'), t('pharmacy', 'Pharmacy'), ta('specialists', 'Other providers / specialists'),
      ] },
      { title: 'Immunizations', fields: [
        radio('imm_record', 'Immunization record available?', ['Yes — attached to email', 'Yes — on Health Gateway', 'No', 'Unknown']),
      ] },
    ],
    attest: 'The health information above is accurate to the best of my knowledge.',
  },
  {
    key: 'emergency_info_sharing',
    code: 'ECC-INT-B2',
    title: 'Emergency Contacts & Consent to Share Information',
    stream: 'Both',
    signer: 'Parent / guardian',
    source: 'RC Program Manual v4 §7.1 (information shared with authorized persons), §17.1 (admission documentation)',
    intro: 'Evergreen keeps personal information private (FOIPPA / PIPA) and shares it only with people who need it to provide care. Please list emergency contacts and who we may share information with.',
    sections: [
      { title: 'Person', fields: [ t('legal_name', 'Legal name of the person in care', R), d('dob', 'Date of birth') ] },
      { title: 'Emergency contacts', fields: [
        t('ec1', 'Emergency contact 1 — name, relationship, phone', R),
        t('ec2', 'Emergency contact 2 — name, relationship, phone'),
      ] },
      { title: 'We may share information with', fields: [
        chk('share_school', 'School / day program staff (as needed for care and safety)'),
        chk('share_health', 'Doctors, nurses, pharmacists and other health providers'),
        chk('share_family', 'Family members listed above'),
        chk('share_counsellor', 'Counsellors / mental health team'),
        ta('share_other', 'Other people or agencies (name and purpose)'),
        ta('do_not_share', 'People we must NOT share information with'),
      ] },
      { title: 'Photos', fields: [
        radio('photos', 'Photos for the person’s own records / life book', ['Yes', 'No']),
        radio('photos_public', 'Photos on Evergreen newsletters or social media', ['No', 'Yes, without name']),
      ] },
    ],
    attest: 'I have the authority to give this consent. I understand I can change or withdraw it at any time by telling the Program Manager in writing.',
  },
  {
    key: 'welcome_rights',
    code: 'ECC-INT-B3',
    title: 'Welcome, Rights & Getting to Know You',
    stream: 'Both',
    signer: 'Youth',
    source: 'RC Program Manual v4 §16.2–16.3 (rights within 4 hours, orientation); CFCSA s.70',
    intro: 'Welcome to Evergreen! You have rights. You can make a complaint any time, and you can call the Representative for Children and Youth at 1-800-476-3933. Tell us a bit about yourself so we can make this feel like home.',
    sections: [
      { title: 'About you', fields: [
        t('legal_name', 'Your name', R), t('preferred_name', 'Name you like to be called'), t('pronouns', 'Your pronouns'),
        ta('likes', 'Things you like (food, music, activities)'), ta('dislikes', 'Things you don’t like'),
        ta('routine', 'Your bedtime / morning routine'), ta('helps', 'What helps you when you are upset'),
        ta('culture', 'Your culture, faith or traditions that matter to you'),
      ] },
      { title: 'Your rights', fields: [
        chk('rights_explained', 'Someone explained my rights to me and I got a copy', R),
        chk('complaint_explained', 'I know how to make a complaint', R),
        chk('advocate_explained', 'I know how to contact the Representative / my advocate', R),
      ] },
    ],
    attest: 'I filled this in myself (or with help) and these are my answers.',
  },

  // ------------------------------------------------------------------ Internal
  {
    key: 'admission_decision',
    code: 'ECC-INT-PM',
    title: 'Admission Decision Record',
    stream: 'Both',
    signer: 'Program Manager',
    internal: true,
    source: 'PM Manual Appendix B; RC Program Manual v4 §16.1',
    intro: 'Complete for every placement decision — accepted or declined. Retained for a minimum of 7 years.',
    sections: [
      { title: 'Referral', fields: [
        t('legal_name', 'Name (legal)', R), d('dob', 'Date of birth'), d('referral_date', 'Date of referral', R),
        t('referrer', 'Referring social worker / CLBC contact', R), d('decision_date', 'Decision date', R),
      ] },
      { title: 'Assessment', fields: [
        radio('authorized', 'Referral authorized by MCFD / DAA / CLBC?', ['Yes', 'No'], R),
        radio('capacity', 'Licensed capacity available?', ['Yes', 'No'], R), t('census', 'Current census / capacity'),
        radio('needs', 'Assessed needs within program capacity to meet safely?', ['Yes', 'Conditional', 'No'], R),
        radio('residents_safe', 'Safety of current residents', ['Safe to proceed', 'Requires modifications', 'Not safe to proceed'], R),
        radio('crc', 'CRC current for all staff who will work with this person?', ['Yes', 'Gap identified — action taken'], R),
        radio('env_mods', 'Environmental modifications required?', ['None', 'Yes — can complete before arrival', 'Yes — requires delay'], R),
        ta('notes', 'Assessment notes'),
      ] },
      { title: 'Decision', fields: [
        radio('decision', 'Decision', ['Accepted', 'Declined', 'Conditional'], R),
        ta('conditions', 'Conditions (if conditional)'), t('declined_notified', 'If declined: funder notified in writing by / date'),
        t('ed_notified', 'ED notification (if out-of-parameters) / date'),
      ] },
    ],
    attest: 'I am the Program Manager (or on-call supervisor with PM ratification within 24 hours) and this is my admission decision.',
  },
];

export const formByKey = (key) => INTAKE_FORMS.find((f) => f.key === key);
export const formsForStream = (stream) => INTAKE_FORMS.filter((f) => f.stream === 'Both' || f.stream === stream);

// Recommended package per stream (manager can add or remove).
export const DEFAULT_PACKAGE = {
  MCFD: [
    { key: 'mcfd_referral', role: 'MCFD social worker' },
    { key: 'routine_health_consent', role: 'MCFD social worker' },
    { key: 'health_profile', role: 'MCFD social worker' },
    { key: 'emergency_info_sharing', role: 'MCFD social worker' },
    { key: 'welcome_rights', role: 'Youth' },
    { key: 'infants_act_info', role: 'Youth' },
  ],
  CLBC: [
    { key: 'clbc_referral', role: 'CLBC facilitator / analyst' },
    { key: 'health_profile', role: 'Family member' },
    { key: 'tsdm_contacts', role: 'Family member' },
    { key: 'emergency_info_sharing', role: 'Adult (self)' },
    { key: 'adult_preferences', role: 'Adult (self)' },
  ],
};
