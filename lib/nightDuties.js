// Night duty lists (drafted in the project: night-duty-lists-draft.md). Shown on the phone during a night shift.
// Defaults until Melvin confirms: safety round at start, middle and end of the shift; on-call escalation as per the house.
export const NIGHT_DUTIES = {
  'Awake night': {
    title: 'Awake night duties',
    start: ['Clock in at the house', 'Read the handover and the communication book', 'Check the MAR for the night’s medication times', 'Check tomorrow’s activity plan'],
    through: [
      'Answer every night check (2-hour and random)',
      'Safety round at the start, middle and end: each resident seen, doors and exits secure, fire exits clear',
      'Give night medication as on the MAR, and record it straight away',
      'Illness or injury: act, record, and notify the PC and on-call',
      'Any incident: report straight away, then the full form',
    ],
    end: ['Write the night entry for each resident and sign it', 'Complete the wellness or health check for each resident', 'Write the handover for the morning shift', 'Clock out'],
    mcfd: 'MCFD: day book and daily wellness check per child. Reportable incidents: social worker immediately.',
    clbc: 'CLBC: daily support note and health and wellbeing check per adult. Illness signs documented promptly.',
  },
  'Sleep night': {
    title: 'Sleep night duties (CLBC)',
    start: ['Clock in at the house', 'Read the handover', 'Check the MAR for any night medication'],
    through: [
      'Location check-in every 2 hours',
      'Respond straight away to any call or alarm; stay until the resident is settled',
      'Give night medication as on the MAR, and record it straight away',
      'Illness, injury or incident: act, record, notify on-call; full form for reportable incidents',
    ],
    end: ['Write the night note for each resident and sign it', 'Write the handover', 'Clock out'],
    clbc: 'CLBC: daily support note and health and wellbeing check per adult. Illness signs documented promptly.',
  },
};

export function nightDutiesFor(label) {
  return NIGHT_DUTIES[label] ?? null;
}
