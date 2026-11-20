// Loads the days-in-care report (plan E5). Database rules decide which youth and adults each person sees
// (a Program Manager sees their houses; directors, the CEO and the Administrator see all).
import { levelOf } from '@/lib/levels';
import { buildDaysInCare } from '@/lib/daysInCare';

export const canSeeDaysInCare = (p) => p?.role === 'admin' || (levelOf(p) >= 3 && !p?.staff_group);

export async function loadDaysInCare(supabase, year) {
  const [{ data: residents }, { data: homes }, { data: missing }] = await Promise.all([
    supabase.from('residents').select('id, first_name, last_name, file_number, home_id, program, funder, care_type, admission_date, discharge_date, status'),
    supabase.from('homes').select('id, name'),
    supabase.from('missing_episodes').select('resident_id, started_at, found_at, closed_at').gte('started_at', `${year - 1}-12-01`).lte('started_at', `${year}-12-31T23:59:59Z`),
  ]);
  return buildDaysInCare({ year, residents, homes, missing });
}
