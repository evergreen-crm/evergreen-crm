// Every log/entry type in the app, defined once.
// Field types: text, textarea, number, select, time, yesno, rating
// scope: 'resident' (about one resident) or 'house' (about the whole house)

export const ENTRY_TYPES = {
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
    scope: 'house', group: 'Communication book', label: 'Communication book', icon: '✎',
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

export const RESIDENT_LOG_GROUPS = ['Contacts', 'Health', 'Behaviour'];

export function typesIn(group) {
  return Object.entries(ENTRY_TYPES).filter(([, t]) => t.group === group).map(([k, t]) => ({ key: k, ...t }));
}
