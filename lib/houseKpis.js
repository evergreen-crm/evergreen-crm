// Narrow the KPI data (from loadKpiData) to one house, so the same KPI engine
// gives each house its own green / yellow / red numbers.
import { computeKpis, overallCompliance } from '@/lib/kpis';

export function filterForHome(d, homeId) {
  const resIds = new Set((d.residents ?? []).filter((r) => r.home_id === homeId).map((r) => r.id));
  const staffIds = new Set((d.profiles ?? []).filter((p) => p.home_id === homeId).map((p) => p.id));
  const keep = (arr, test) => (arr == null ? arr : arr.filter(test));
  const byRes = (x) => resIds.has(x.resident_id);
  const byStaff = (x) => staffIds.has(x.profile_id);
  const byHome = (x) => x.home_id === homeId || (x.home_id == null && x.resident_id && resIds.has(x.resident_id));
  return {
    ...d,
    homes: keep(d.homes, (h) => h.id === homeId),
    residents: keep(d.residents, (r) => r.home_id === homeId),
    profiles: keep(d.profiles, (p) => p.home_id === homeId),
    details: keep(d.details, byStaff),
    certs: keep(d.certs, byStaff),
    trainings: keep(d.trainings, byStaff),
    incidents: keep(d.incidents, byHome),
    meds: keep(d.meds, byRes),
    mar: keep(d.mar, byRes),
    appts: keep(d.appts, byHome),
    shifts: keep(d.shifts, (s) => s.home_id === homeId),
    timeWeek: keep(d.timeWeek, byStaff),
    timePending: keep(d.timePending, byStaff),
    timeMonth: keep(d.timeMonth, byStaff),
    drills: keep(d.drills, (x) => x.home_id === homeId),
    records: keep(d.records, byHome),
    acks: keep(d.acks, byStaff),
    onboardings: keep(d.onboardings, byStaff),
    reqs: keep(d.reqs, byRes),
    goals: keep(d.goals, byRes),
  };
}

// The tiles shown on a house dashboard and in the houses overview, in order.
export const HOUSE_TILES = [
  { key: 'active_residents', icon: '👥', label: 'Residents' },
  { key: 'on_duty', icon: '👨‍⚕️', label: 'Staff on duty now' },
  { key: 'open_incidents', icon: '📋', label: 'Open incidents' },
  { key: 'mar_complete', icon: '💊', label: 'Medication documentation (7 days)' },
  { key: 'med_errors', icon: '🏥', label: 'Medication errors (month)' },
  { key: 'care_plans', icon: '✅', label: 'Care plans current' },
  { key: 'appts_done', icon: '📅', label: 'Appointments completed (30 days)' },
  { key: 'contract_reqs', icon: '📑', label: 'Required documents' },
  { key: 'fire_drills', icon: '🔥', label: 'Fire drill this month' },
  { key: 'safety_checks', icon: '🛡️', label: 'Safety check this month' },
  { key: 'shift_coverage', icon: '🗓', label: 'Shift coverage (7 days)' },
  { key: 'training', icon: '🎓', label: 'Staff training' },
];

export function houseKpis(d, homeId) {
  const kpis = computeKpis(filterForHome(d, homeId));
  const by = Object.fromEntries(kpis.map((k) => [k.key, k]));
  return { kpis, by, overall: overallCompliance(kpis) };
}

// Show "Done" / "Not yet" instead of "1 / 1 houses" when looking at a single house.
export function houseValue(k) {
  if (['fire_drills', 'safety_checks'].includes(k.key)) return /^\s*0\s*\//.test(String(k.value)) ? 'Not yet' : 'Done';
  return k.value;
}
