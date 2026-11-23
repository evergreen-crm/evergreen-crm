// Licensing inspection pack (plan E6): everything an MCFD or CLBC licensing officer usually asks for, for one house,
// on one printable page. Read with the signed-in person's own access (database rules decide what they see).
import { policyFor } from '@/lib/policyDue';
import { addDaysISO, todayISO } from '@/lib/options';
import { COURSES } from '@/lib/courses/catalog';

const within = (d, from, to) => d && d >= from && d <= to;

export async function loadInspectionPack(supabase, homeId) {
  const today = todayISO();
  const yearAgo = addDaysISO(today, -365);
  const d90 = addDaysISO(today, -90);
  const { data: home } = await supabase.from('homes')
    .select('id, name, address, licence_number, phone, on_call_phone, program, capacity, house_type, staff_day, staff_evening, staff_night').eq('id', homeId).maybeSingle();
  if (!home) return null;

  const [{ data: staff }, { data: residents }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, level, staff_group, active, is_test').eq('home_id', homeId).eq('active', true),
    supabase.from('residents').select('id, first_name, last_name, care_type, program, admission_date, discharge_date, status, file_number').eq('home_id', homeId),
  ]);
  const staffIds = (staff ?? []).map((s) => s.id);
  const residentIds = (residents ?? []).filter((r) => !r.discharge_date || r.discharge_date >= today).map((r) => r.id);
  const none = ['00000000-0000-0000-0000-000000000000'];
  const [
    { data: details }, { data: trainings }, { data: orient }, { data: attempts }, { data: courses }, { data: policies }, { data: acks },
    { data: drills }, { data: checks }, { data: incidents }, { data: meds }, { data: plans }, { data: consents },
  ] = await Promise.all([
    supabase.from('staff_details').select('profile_id, position, hire_date, employee_no, program').in('profile_id', staffIds.length ? staffIds : none),
    supabase.from('trainings').select('profile_id, title, completed_on, expires_on, verified_by').in('profile_id', staffIds.length ? staffIds : none),
    supabase.from('orientation_completions').select('profile_id, completed_at').in('profile_id', staffIds.length ? staffIds : none),
    supabase.from('course_attempts').select('profile_id, course_key, passed').eq('passed', true).in('profile_id', staffIds.length ? staffIds : none),
    Promise.resolve({ data: COURSES.map((c) => ({ course_key: c.key })) }),
    supabase.from('policies').select('id, current_version_id, active, require_signature, applies_to, applies_roles').eq('active', true).eq('require_signature', true),
    supabase.from('policy_acks').select('profile_id, policy_version_id').in('profile_id', staffIds.length ? staffIds : none),
    supabase.from('entries').select('entry_date, entry_time, data').eq('home_id', homeId).eq('kind', 'fire_drill').gte('entry_date', yearAgo).order('entry_date', { ascending: false }),
    supabase.from('entries').select('entry_date, data').eq('home_id', homeId).eq('kind', 'safety_check').gte('entry_date', yearAgo).order('entry_date', { ascending: false }),
    supabase.from('incidents').select('id, occurred_on, incident_type, is_critical, written_report_sent_on, manager_review_at, funder_told_at, status').eq('home_id', homeId).gte('occurred_on', yearAgo),
    supabase.from('med_administrations').select('status, admin_date').in('resident_id', residentIds.length ? residentIds : none).gte('admin_date', d90),
    supabase.from('care_plans').select('resident_id, next_review_on, last_review_on').in('resident_id', residentIds.length ? residentIds : none),
    supabase.from('resident_consents').select('resident_id, kind, expires_on').in('resident_id', residentIds.length ? residentIds : none),
  ]);

  // Staff
  const det = new Map((details ?? []).map((d) => [d.profile_id, d]));
  const currentVersions = new Set((policies ?? []).map((p) => p.current_version_id).filter(Boolean));
  const courseCount = (courses ?? []).length;
  const staffRows = (staff ?? []).map((s) => {
    const t = (trainings ?? []).filter((x) => x.profile_id === s.id);
    const latest = (re) => t.filter((x) => re.test(x.title)).sort((a, b) => (b.expires_on ?? b.completed_on ?? '').localeCompare(a.expires_on ?? a.completed_on ?? ''))[0] ?? null;
    const firstAid = latest(/first aid/i);
    const crc = latest(/criminal|crra|record check/i);
    const expired = t.filter((x) => x.expires_on && x.expires_on < today).map((x) => x.title);
    // Only the policies that apply to this person's program and job (policies by role, Nov 22 2026).
    const theirs = new Set((policies ?? []).filter((p) => p.current_version_id && policyFor(p, det.get(s.id)?.program, s)).map((p) => p.current_version_id));
    const signed = new Set((acks ?? []).filter((a) => a.profile_id === s.id && theirs.has(a.policy_version_id)).map((a) => a.policy_version_id)).size;
    const passed = new Set((attempts ?? []).filter((a) => a.profile_id === s.id).map((a) => a.course_key)).size;
    const o = (orient ?? []).find((x) => x.profile_id === s.id);
    const d = det.get(s.id) ?? {};
    return {
      id: s.id, name: s.full_name, test: s.is_test, position: d.position ?? '', employee_no: d.employee_no ?? '', hire_date: d.hire_date ?? null,
      firstAid, crc, expired, orientation: o?.completed_at?.slice(0, 10) ?? null, passed, courseCount, signed, policyCount: theirs.size,
      flags: [
        !firstAid ? 'No First Aid on file' : firstAid.expires_on && firstAid.expires_on < today ? 'First Aid expired' : null,
        !crc ? 'No criminal record check on file' : null,
        !o ? 'Orientation not complete' : null,
        theirs.size && signed < theirs.size ? `${theirs.size - signed} policies not signed` : null,
        ...expired.filter((x) => !/first aid/i.test(x)).map((x) => `${x} expired`),
      ].filter(Boolean),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Youth and adults (current)
  const resRows = (residents ?? []).filter((r) => residentIds.includes(r.id)).map((r) => {
    const plan = (plans ?? []).find((p) => p.resident_id === r.id);
    const cons = (consents ?? []).filter((c) => c.resident_id === r.id);
    return {
      id: r.id, name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(), care_type: r.care_type, program: r.program, admission_date: r.admission_date, file_number: r.file_number,
      next_review: plan?.next_review_on ?? null, last_review: plan?.last_review_on ?? null,
      consentsExpired: cons.filter((c) => c.expires_on && c.expires_on < today).map((c) => c.kind),
      consentsSoon: cons.filter((c) => c.expires_on && c.expires_on >= today && c.expires_on <= addDaysISO(today, 30)).map((c) => c.kind),
      flags: [
        !plan ? 'No care plan' : plan.next_review_on && plan.next_review_on < today ? 'Care plan review overdue' : null,
        !r.admission_date ? 'No admission date' : null,
      ].filter(Boolean),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Fire drills: one a month expected; list the months in the last 12 with none.
  const drillMonths = new Set((drills ?? []).map((d) => d.entry_date.slice(0, 7)));
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); });
  const noDrill = months.filter((m) => !drillMonths.has(m) && m < today.slice(0, 7)).reverse();

  // Safety checks
  const checkSummary = {};
  for (const c of checks ?? []) {
    const k = c.data?.item ?? 'Other';
    const s = (checkSummary[k] ??= { item: k, count: 0, last: null, open: 0 });
    s.count += 1; if (!s.last || c.entry_date > s.last) s.last = c.entry_date;
    if (c.data?.result === 'Fail — needs action') s.open += 1;
  }

  // Incidents
  const inc = incidents ?? [];
  const byType = {};
  for (const i of inc) byType[i.incident_type ?? 'Other'] = (byType[i.incident_type ?? 'Other'] ?? 0) + 1;
  const late = inc.filter((i) => i.is_critical && (!i.written_report_sent_on || i.written_report_sent_on > addDaysISO(i.occurred_on, 1)));
  const noReview = inc.filter((i) => !i.manager_review_at && i.occurred_on < addDaysISO(today, -7));
  const medErrors = inc.filter((i) => /medic/i.test(i.incident_type ?? '')).length;

  // Medication (last 90 days)
  const medCounts = {};
  for (const m of meds ?? []) medCounts[m.status ?? 'unknown'] = (medCounts[m.status ?? 'unknown'] ?? 0) + 1;

  return {
    today, yearAgo, d90, home, staffRows, resRows, drills: drills ?? [], noDrill, checks: Object.values(checkSummary), checksTotal: (checks ?? []).length,
    incidents: { total: inc.length, critical: inc.filter((i) => i.is_critical).length, byType, late: late.length, noReview: noReview.length, open: inc.filter((i) => i.status && !/closed/i.test(i.status)).length, medErrors },
    meds: { total: (meds ?? []).length, counts: medCounts },
  };
}
