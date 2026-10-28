// The records a house must keep, by program. MCFD houses use the MCFD standards (lib/mcfdStandards.js);
// CLBC houses use the CLBC daily notes, health check and medication record.
// Used by the house side panel (every record, every section, any date and time) and the documentation guide.
import { MCFD_RECORDS } from '@/lib/mcfdStandards';

export const CLBC_RECORDS = [
  { kind: 'clbc_day', section: 'Daily support note', standard: 'CLBC standards §3, §7', when: 'Every day, for every adult: what happened, goal worked on, mood, follow-up' },
  { kind: 'clbc_wellness', section: 'Daily health and wellbeing check', standard: 'CLBC standards §9, §11', when: 'Every day, for every adult: signs of illness, medications, meals, fluids, personal care, sleep, safety' },
  { kind: 'mar', section: 'Medication (MAR)', standard: 'CLBC standards §11', when: 'Each dose given or refused, on the Medications tab', tab: 'mar' },
];

const DAILY = new Set(['day_book', 'wellness_check', 'clbc_day', 'clbc_wellness']);

export const recordsFor = (program) => (program === 'CLBC' ? CLBC_RECORDS : program === 'MCFD' ? MCFD_RECORDS : []);
export const isDaily = (r) => DAILY.has(r.kind);
