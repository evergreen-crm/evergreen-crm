// Every log/entry type in the app, defined once.
// Field types: text, textarea, number, select, time, yesno, rating
// scope: 'resident' (about one resident) or 'house' (about the whole house)

export const ENTRY_TYPES = {
  // ---------- MCFD: physical intervention or restraint record (MCFD standards C.3.9, C.3.11, C.2.8) ----------
  mcfd_restraint: {
    scope: 'resident', group: 'MCFD', label: 'Restraint record', icon: '⚠',
    fields: [
      { name: 'reason', label: 'What was happening before (the behaviour of concern)', type: 'textarea', required: true },
      { name: 'technique', label: 'Type of intervention', type: 'select', required: true, options: ['Physical hold', 'Escort', 'Other physical intervention', 'Seclusion or restricted practice'] },
      { name: 'duration_min', label: 'How long (minutes)', type: 'number', required: true },
      { name: 'staff_involved', label: 'Staff involved', type: 'text', required: true },
      { name: 'witnesses', label: 'Witnesses', type: 'text' },
      { name: 'child_view', label: 'The child’s view of what happened', type: 'textarea', required: true },
      { name: 'staff_view', label: 'The staff’s view of what happened', type: 'textarea', required: true },
      { name: 'injury', label: 'Any injury to the child or staff?', type: 'yesno', required: true },
      { name: 'injury_details', label: 'Injury details (if yes)', type: 'text' },
      { name: 'social_worker_notified', label: 'Social worker notified immediately', type: 'yesno', required: true },
      { name: 'management_notified', label: 'Manager notified', type: 'yesno', required: true },
      { name: 'debrief_done', label: 'Debrief done with the child', type: 'yesno', required: true },
      { name: 'debrief_notes', label: 'What the child said in the debrief, and any witnesses’ views', type: 'textarea' },
      { name: 'wellbeing', label: 'The child’s wellbeing afterwards', type: 'textarea', required: true },
    ],
    summary: (d) => {
      const missing = [d.social_worker_notified !== 'Yes' && 'social worker not yet notified', d.debrief_done !== 'Yes' && 'debrief not done', d.management_notified !== 'Yes' && 'manager not notified'].filter(Boolean);
      return [d.technique, d.duration_min && `${d.duration_min} min`, d.reason, `Child’s view: ${d.child_view}`, `Staff’s view: ${d.staff_view}`, missing.length ? `To do: ${missing.join(', ')}` : 'Notifications and debrief done', d.injury === 'Yes' && `Injury: ${d.injury_details ?? 'see record'}`].filter(Boolean).join(' · ');
    },
  },
  // ---------- MCFD: reportable incident, discipline, serious illness or injury, views, service record, care review ----------
  mcfd_incident: {
    scope: 'resident', group: 'MCFD', label: 'Reportable incident', icon: '🚨',
    fields: [
      { name: 'incident_type', label: 'Type (MCFD standard C.2.8)', type: 'select', required: true, options: ['Death', 'Medical treatment (serious injury or illness)', 'Abuse or neglect allegation', 'Missing child or youth', 'Restraint or seclusion', 'Police involvement', 'Criminal charge or conviction (child, staff or others)', 'Any other circumstance affecting safety or well-being'] },
      { name: 'time_of_incident', label: 'Time it happened', type: 'time', required: true },
      { name: 'what_happened', label: 'What happened (facts only)', type: 'textarea', required: true },
      { name: 'child_view', label: 'The child’s view', type: 'textarea' },
      { name: 'staff_view', label: 'The staff’s view', type: 'textarea', required: true },
      { name: 'sw_notified', label: 'Social worker notified immediately', type: 'yesno', required: true },
      { name: 'sw_notified_detail', label: 'Who was notified, and when', type: 'text' },
      { name: 'manager_notified', label: 'Manager notified', type: 'yesno', required: true },
      { name: 'guardian_notified', label: 'Parent or guardian notified (if the care plan says so)', type: 'yesno' },
      { name: 'actions', label: 'Action taken and care given', type: 'textarea', required: true },
      { name: 'follow_up', label: 'Follow-up needed', type: 'textarea' },
    ],
    summary: (d) => {
      const missing = [d.sw_notified !== 'Yes' && 'social worker not yet notified', d.manager_notified !== 'Yes' && 'manager not notified'].filter(Boolean);
      return [d.incident_type, d.what_happened, missing.length ? `To do: ${missing.join(', ')}` : 'Notifications done'].filter(Boolean).join(' · ');
    },
  },
  mcfd_discipline: {
    scope: 'resident', group: 'MCFD', label: 'Behaviour of concern and discipline', icon: '⚖',
    fields: [
      { name: 'events_before', label: 'Events leading up to the behaviour of concern', type: 'textarea', required: true },
      { name: 'behaviour', label: 'The behaviour of concern', type: 'textarea', required: true },
      { name: 'discipline_action', label: 'Disciplinary action taken (under policy)', type: 'textarea', required: true },
      { name: 'policy_followed', label: 'Action followed the written policy', type: 'yesno', required: true },
      { name: 'child_view', label: 'The child’s view', type: 'textarea' },
    ],
    summary: (d) => [d.behaviour, d.discipline_action && `Action: ${d.discipline_action}`, d.policy_followed === 'No' && 'Policy not followed: review needed'].filter(Boolean).join(' · '),
  },
  mcfd_illness: {
    scope: 'resident', group: 'MCFD', label: 'Serious illness or injury', icon: '🩹',
    fields: [
      { name: 'description', label: 'What happened, and the signs seen', type: 'textarea', required: true },
      { name: 'treatment', label: 'Treatment given, and by whom', type: 'textarea', required: true },
      { name: 'sw_notified', label: 'Social worker notified', type: 'yesno', required: true },
      { name: 'guardian_notified', label: 'Parent or guardian notified', type: 'yesno', required: true },
      { name: 'follow_up', label: 'Follow-up and next check', type: 'textarea' },
    ],
    summary: (d) => [d.description, d.treatment && `Treatment: ${d.treatment}`, d.sw_notified !== 'Yes' && 'social worker not yet notified'].filter(Boolean).join(' · '),
  },
  mcfd_views: {
    scope: 'resident', group: 'MCFD', label: 'Views of child, family and others', icon: '💬',
    fields: [
      { name: 'whose_view', label: 'Whose view', type: 'select', required: true, options: ['Child or youth', 'Parent or guardian', 'Family member', 'Social worker', 'Other person of significance'] },
      { name: 'view', label: 'The view, in their words', type: 'textarea', required: true },
      { name: 'used_in_plan', label: 'Used in the care plan', type: 'yesno' },
    ],
    summary: (d) => [d.whose_view, d.view].filter(Boolean).join(': '),
  },
  mcfd_record_note: {
    scope: 'resident', group: 'MCFD', label: 'Individual service record update', icon: '🗂',
    fields: [
      { name: 'section', label: 'Section of the individual service record (E.7.10)', type: 'select', required: true, options: [
        'Intake documentation (information, required documents, consents)',
        'Indigenous identity (where the child is Indigenous)',
        'Legal documents (court orders, legal status, guardianship)',
        'Health: medical and dental information, immunization, signed consents',
        'Assessment information',
        'Care plan responsibilities and reviews',
        'Daily record (day book)',
        'Incident documentation',
        'Complaints',
        'Service termination or transition plan',
        'Other personal information or documents',
      ] },
      { name: 'note', label: 'What was added or changed', type: 'textarea', required: true },
      { name: 'document_on_file', label: 'Document filed in the record', type: 'yesno' },
    ],
    summary: (d) => [d.section, d.note].filter(Boolean).join(' · '),
  },
  mcfd_care_review: {
    scope: 'resident', group: 'MCFD', label: 'Care plan and goal review', icon: '📋',
    fields: [
      { name: 'goal_id', label: 'Goal being reviewed', type: 'goal', required: true },
      { name: 'goal_progress', label: 'Progress against the measurable objective (what was achieved, and when)', type: 'textarea', required: true },
      { name: 'objective_met', label: 'Objective met?', type: 'select', required: true, options: ['Yes', 'Partly', 'No'] },
      { name: 'child_input', label: 'The child’s or youth’s own view of their progress and plan', type: 'textarea', required: true },
      { name: 'reviewed_with', label: 'Reviewed with (names and roles)', type: 'text' },
      { name: 'changes', label: 'Changes to the goal, the steps or the plan', type: 'textarea' },
      { name: 'next_review_date', label: 'Next review date', type: 'date', required: true },
    ],
    summary: (d, ctx) => [ctx?.goals?.[d.goal_id], d.objective_met && `Met: ${d.objective_met}`, d.goal_progress, d.next_review_date && `Next review ${d.next_review_date}`].filter(Boolean).join(' · '),
  },

  // ---------- MCFD: nothing to report today (confirms no incident, restraint, discipline or serious illness) ----------
  nothing_to_report: {
    scope: 'resident', group: 'MCFD', label: 'Nothing to report today', icon: '✔',
    fields: [
      { name: 'confirmed', label: 'Confirm: no reportable incident, restraint, discipline or serious illness or injury today', type: 'select', required: true, options: ['Yes, nothing to report today'] },
      { name: 'note', label: 'Anything else to note (optional)', type: 'textarea' },
    ],
    summary: (d) => ['Nothing to report today', d.note].filter(Boolean).join(' · '),
  },

  // ---------- CLBC houses (adults): daily support note and daily health and wellbeing check ----------
  clbc_day: {
    scope: 'resident', group: 'CLBC', label: 'Daily support note', icon: '📝',
    fields: [
      { name: 'routine', label: 'Day', type: 'select', required: true, options: ['Usual day', 'Day changed'] },
      { name: 'what_happened', label: 'What happened today (supports given, activities, anything important)', type: 'textarea', required: true },
      { name: 'plan_goal', label: 'Goal from the individual plan worked on today', type: 'text' },
      { name: 'community', label: 'Community or day program activity', type: 'text' },
      { name: 'mood', label: 'Mood', type: 'select', options: ['Settled', 'Happy', 'Withdrawn', 'Anxious', 'Upset', 'Angry', 'Other'] },
      { name: 'follow_up', label: 'Follow-up needed', type: 'text' },
    ],
    summary: (d) => [d.routine, d.mood && `Mood: ${d.mood}`, d.what_happened, d.plan_goal && `Goal: ${d.plan_goal}`, d.community && `Community: ${d.community}`, d.follow_up && `Follow-up: ${d.follow_up}`].filter(Boolean).join(' · '),
  },
  clbc_wellness: {
    scope: 'resident', group: 'CLBC', label: 'Daily health and wellbeing check', icon: '🩺',
    fields: [
      { name: 'no_illness_signs', label: 'No signs of illness (or reported and acted on)', type: 'yesno' },
      { name: 'meds_given', label: 'Medications given as on the MAR', type: 'yesno' },
      { name: 'meals', label: 'Ate meals', type: 'yesno' },
      { name: 'fluids', label: 'Had fluids', type: 'yesno' },
      { name: 'personal_care', label: 'Personal care done', type: 'yesno' },
      { name: 'slept', label: 'Slept', type: 'yesno' },
      { name: 'safe', label: 'Safe at home today', type: 'yesno' },
      { name: 'concerns', label: 'Concerns (if any)', type: 'textarea' },
      { name: 'action', label: 'What was done about a concern', type: 'text' },
    ],
    summary: (d) => {
      const items = [['Illness signs', d.no_illness_signs], ['Meds', d.meds_given], ['Meals', d.meals], ['Fluids', d.fluids], ['Personal care', d.personal_care], ['Slept', d.slept], ['Safe', d.safe]];
      const notYes = items.filter(([, v]) => v === 'No').map(([k]) => k);
      return [notYes.length ? `Not yes: ${notYes.join(', ')}` : 'All checks yes', d.concerns && `Concern: ${d.concerns}`, d.action && `Done: ${d.action}`].filter(Boolean).join(' · ');
    },
  },
  // ---------- MCFD houses (children and youth): day book and daily wellness check ----------
  day_book: {
    scope: 'resident', group: 'MCFD', label: 'Day book', icon: '📖',
    fields: [
      { name: 'routine', label: 'Routine today', type: 'select', required: true, options: ['Normal routine', 'Routine changed'] },
      { name: 'what_happened', label: 'What happened today (significant events)', type: 'textarea', required: true },
      { name: 'routine_change', label: 'What changed in the routine (if changed)', type: 'text' },
      { name: 'mood', label: 'Mood', type: 'select', options: ['Settled', 'Happy', 'Withdrawn', 'Anxious', 'Upset', 'Angry', 'Other'] },
      { name: 'school_work', label: 'School or day program', type: 'text' },
      { name: 'visits_calls', label: 'Visits or calls', type: 'text' },
      { name: 'follow_up', label: 'Follow-up needed', type: 'text' },
    ],
    summary: (d) => [d.routine, d.routine_change && `(${d.routine_change})`, d.mood && `Mood: ${d.mood}`, d.what_happened, d.school_work && `School: ${d.school_work}`, d.visits_calls && `Visits/calls: ${d.visits_calls}`, d.follow_up && `Follow-up: ${d.follow_up}`].filter(Boolean).join(' · '),
  },
  wellness_check: {
    scope: 'resident', group: 'MCFD', label: 'Daily wellness check', icon: '✅',
    fields: [
      { name: 'seen_safe', label: 'Seen today and safe', type: 'yesno' },
      { name: 'meals', label: 'Ate meals', type: 'yesno' },
      { name: 'fluids', label: 'Had fluids', type: 'yesno' },
      { name: 'personal_care', label: 'Personal care done', type: 'yesno' },
      { name: 'meds_given', label: 'Medications given as on the MAR', type: 'yesno' },
      { name: 'slept', label: 'Slept', type: 'yesno' },
      { name: 'no_new_injury', label: 'No new injury or marks', type: 'yesno' },
      { name: 'concerns', label: 'Concerns (if any)', type: 'textarea' },
      { name: 'action', label: 'What was done about a concern', type: 'text' },
    ],
    summary: (d) => {
      const items = [['Seen safe', d.seen_safe], ['Meals', d.meals], ['Fluids', d.fluids], ['Personal care', d.personal_care], ['Meds', d.meds_given], ['Slept', d.slept], ['No new injury', d.no_new_injury]];
      const notYes = items.filter(([, v]) => v === 'No').map(([k]) => k);
      return [notYes.length ? `Not yes: ${notYes.join(', ')}` : 'All checks yes', d.concerns && `Concern: ${d.concerns}`, d.action && `Done: ${d.action}`].filter(Boolean).join(' · ');
    },
  },
  // ---------- Resident logs ----------
  contact: {
    scope: 'resident', group: 'Contacts', label: 'Contact log', icon: '☎',
    fields: [
      { name: 'with_whom', label: 'Contact with', type: 'select', required: true, options: ['Social worker (MCFD)', 'CLBC analyst / facilitator', 'Family / guardian', 'Doctor / health', 'School / day program', 'Police', 'Lawyer / advocate', 'Other'] },
      { name: 'method', label: 'How', type: 'select', options: ['Phone', 'Email', 'In person', 'Video call', 'Text'] },
      { name: 'contact_name', label: 'Name', type: 'text' },
      { name: 'summary', label: 'Summary', type: 'textarea', required: true },
      { name: 'follow_up', label: 'Follow-up needed', type: 'text' },
    ],
    summary: (d) => `${d.with_whom}${d.contact_name ? ` (${d.contact_name})` : ''}${d.method ? ` · ${d.method}` : ''}: ${d.summary}`,
  },
  vitals: {
    scope: 'resident', group: 'Health', label: 'Vital signs', icon: '♥',
    fields: [
      { name: 'bp_sys', label: 'BP systolic', type: 'number' },
      { name: 'bp_dia', label: 'BP diastolic', type: 'number' },
      { name: 'pulse', label: 'Pulse (bpm)', type: 'number' },
      { name: 'temp', label: 'Temp (°C)', type: 'number', step: '0.1' },
      { name: 'o2', label: 'O₂ sat (%)', type: 'number' },
      { name: 'notes', label: 'Notes', type: 'text' },
    ],
    summary: (d) => [d.bp_sys && `BP ${d.bp_sys}/${d.bp_dia ?? '?'}`, d.pulse && `Pulse ${d.pulse}`, d.temp && `Temp ${d.temp}°C`, d.o2 && `O₂ ${d.o2}%`, d.notes].filter(Boolean).join(' · '),
  },
  weight: {
    scope: 'resident', group: 'Health', label: 'Weight', icon: '⚖',
    fields: [
      { name: 'kg', label: 'Weight (kg)', type: 'number', step: '0.1', required: true },
      { name: 'notes', label: 'Notes', type: 'text' },
    ],
    summary: (d) => `${d.kg} kg${d.notes ? ` · ${d.notes}` : ''}`,
  },
  sleep: {
    scope: 'resident', group: 'Health', label: 'Sleep', icon: '☾',
    fields: [
      { name: 'bedtime', label: 'Bedtime', type: 'time' },
      { name: 'wake', label: 'Woke up', type: 'time' },
      { name: 'quality', label: 'Quality', type: 'select', options: ['Slept well', 'Restless', 'Up several times', 'Did not sleep'] },
      { name: 'night_checks', label: 'Night checks / notes', type: 'textarea' },
    ],
    summary: (d) => [d.bedtime && `Bed ${d.bedtime}`, d.wake && `Up ${d.wake}`, d.quality, d.night_checks].filter(Boolean).join(' · '),
  },
  seizure: {
    scope: 'resident', group: 'Health', label: 'Seizure', icon: '⚡',
    fields: [
      { name: 'duration', label: 'Duration (minutes)', type: 'number', step: '0.5', required: true },
      { name: 'type', label: 'Type', type: 'select', options: ['Tonic-clonic', 'Absence', 'Focal', 'Unknown'] },
      { name: 'description', label: 'What you saw', type: 'textarea', required: true },
      { name: 'prn_given', label: 'Emergency medication given', type: 'yesno' },
      { name: 'after', label: 'After the seizure', type: 'text' },
    ],
    summary: (d) => `${d.type ?? 'Seizure'} · ${d.duration} min${d.prn_given === 'Yes' ? ' · PRN given' : ''} · ${d.description}`,
  },
  bowel: {
    scope: 'resident', group: 'Health', label: 'Bowel movement', icon: '◦',
    fields: [
      { name: 'bristol', label: 'Bristol type (1–7)', type: 'select', options: ['1', '2', '3', '4', '5', '6', '7'] },
      { name: 'size', label: 'Size', type: 'select', options: ['Small', 'Medium', 'Large'] },
      { name: 'notes', label: 'Notes', type: 'text' },
    ],
    summary: (d) => [d.bristol && `Type ${d.bristol}`, d.size, d.notes].filter(Boolean).join(' · '),
  },
  behaviour: {
    scope: 'resident', group: 'Behaviour', label: 'Behaviour chart (ABC)', icon: '▲',
    fields: [
      { name: 'antecedent', label: 'A — what happened before', type: 'textarea', required: true },
      { name: 'behaviour', label: 'B — the behaviour', type: 'textarea', required: true },
      { name: 'consequence', label: 'C — what happened after', type: 'textarea' },
      { name: 'intensity', label: 'Intensity (1 low – 5 high)', type: 'select', options: ['1', '2', '3', '4', '5'] },
      { name: 'duration', label: 'Duration (minutes)', type: 'number' },
      { name: 'strategies', label: 'Support strategies used', type: 'text' },
    ],
    summary: (d) => `B: ${d.behaviour}${d.intensity ? ` · intensity ${d.intensity}` : ''} · A: ${d.antecedent}${d.consequence ? ` · C: ${d.consequence}` : ''}`,
  },
  goal_progress: {
    scope: 'resident', group: 'Goals', label: 'Goal progress', icon: '★', hidden: true,
    fields: [
      { name: 'goal_id', label: 'Goal', type: 'goal', required: true },
      { name: 'level', label: 'Today', type: 'select', required: true, options: ['Independent', 'With prompts', 'With full support', 'Refused / not attempted'] },
      { name: 'note', label: 'Note', type: 'text' },
    ],
    summary: (d, ctx) => `${ctx?.goals?.[d.goal_id] ?? 'Goal'}: ${d.level}${d.note ? ` · ${d.note}` : ''}`,
  },
  money: {
    scope: 'resident', group: 'Money', label: 'Money log', icon: '$', hidden: true,
    fields: [
      { name: 'type', label: 'Type', type: 'select', required: true, options: ['Money in (allowance, deposit)', 'Money out (spending)'] },
      { name: 'amount', label: 'Amount ($)', type: 'number', step: '0.01', required: true },
      { name: 'description', label: 'What for', type: 'text', required: true },
      { name: 'receipt', label: 'Receipt kept', type: 'yesno' },
    ],
    summary: (d) => `${d.description}${d.receipt === 'Yes' ? ' · receipt kept' : d.receipt === 'No' ? ' · no receipt' : ''}`,
  },

  // ---------- House logs ----------
  commbook: {
    scope: 'house', group: 'Shift log', label: 'Shift log', icon: '✎',
    fields: [
      { name: 'priority', label: 'Priority', type: 'select', options: ['Normal', 'Important'] },
      { name: 'for_shift', label: 'For', type: 'select', options: ['All staff', 'Day shift', 'Evening shift', 'Night shift', 'Manager'] },
      { name: 'message', label: 'Message', type: 'textarea', required: true },
    ],
    summary: (d) => `${d.priority === 'Important' ? '‼ ' : ''}${d.for_shift ? `[${d.for_shift}] ` : ''}${d.message}`,
  },
  fire_drill: {
    scope: 'house', group: 'Safety', label: 'Fire drill', icon: '🔥',
    fields: [
      { name: 'evac_time', label: 'Evacuation time (mm:ss)', type: 'text', required: true },
      { name: 'residents_out', label: 'Residents evacuated', type: 'number' },
      { name: 'staff_present', label: 'Staff present', type: 'text' },
      { name: 'drill_type', label: 'Drill type', type: 'select', options: ['Day', 'Evening', 'Night / sleeping hours', 'Unannounced'] },
      { name: 'issues', label: 'Issues and follow-up', type: 'textarea' },
    ],
    summary: (d) => `${d.drill_type ?? 'Drill'} · out in ${d.evac_time}${d.residents_out ? ` · ${d.residents_out} residents` : ''}${d.issues ? ` · ${d.issues}` : ''}`,
  },
  safety_check: {
    scope: 'house', group: 'Safety', label: 'Safety check', icon: '✔',
    fields: [
      { name: 'item', label: 'What was checked', type: 'select', required: true, options: ['Smoke & CO alarms', 'Fire extinguishers', 'Emergency exits & lighting', 'First aid kit', '72-hour emergency kit', 'Medication storage', 'Hot water temperature', 'Vehicle', 'Other'] },
      { name: 'result', label: 'Result', type: 'select', required: true, options: ['Pass', 'Fail — fixed', 'Fail — needs action'] },
      { name: 'notes', label: 'Notes / action needed', type: 'text' },
    ],
    summary: (d) => `${d.item}: ${d.result}${d.notes ? ` · ${d.notes}` : ''}`,
  },
};

export const RESIDENT_LOG_GROUPS = ['MCFD', 'CLBC', 'Contacts', 'Health', 'Behaviour'];

export function typesIn(group) {
  return Object.entries(ENTRY_TYPES).filter(([, t]) => t.group === group).map(([k, t]) => ({ key: k, ...t }));
}
