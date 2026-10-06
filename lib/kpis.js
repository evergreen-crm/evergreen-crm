// Evergreen KPI engine.
// Every KPI is defined ONCE here. The KPI page, the executive dashboard, the monthly
// scorecard and the "Action required" scan all read from this file, so a number is never
// worked out two different ways.
//
// Colours:  green = on target · yellow = attention (below target, or due soon) · red = overdue / risk
// Defaults: % KPIs green at target, yellow within 5 points; dates turn yellow 30 days before an
//           expiry and 7 days before a due date.
import { todayISO, addDaysISO, weekStart, shiftHours, nowTime } from '@/lib/options';
import { writtenDue, reviewDue } from '@/lib/incidents';
import { programsFor, itemState } from '@/lib/requirements';
import { trainingsFor, trainingStatus } from '@/lib/onboarding';
import { levelOf, groupOf, GROUPS } from '@/lib/levels';

export const EXPIRY_WARN_DAYS = 30;
export const DUE_WARN_DAYS = 7;

export const AREAS = [
  { key: 'care', num: 1, icon: '🧑‍🤝‍🧑', title: 'Client / resident care', minLevel: 2 },
  { key: 'staffing', num: 2, icon: '👥', title: 'Staffing', minLevel: 3 },
  { key: 'compliance', num: 3, icon: '📑', title: 'Compliance', minLevel: 3 },
  { key: 'safety', num: 4, icon: '🦺', title: 'Health & safety', minLevel: 2 },
  { key: 'qa', num: 5, icon: '📊', title: 'Quality assurance', minLevel: 3 },
  { key: 'hr', num: 6, icon: '🪪', title: 'HR', minLevel: 3 },
  { key: 'finance', num: 7, icon: '💰', title: 'Finance', minLevel: 5 },
  { key: 'operations', num: 8, icon: '🏡', title: 'Operations', minLevel: 2 },
  { key: 'training', num: 9, icon: '🎓', title: 'Training', minLevel: 2 },
  { key: 'mcfd', num: 10, icon: '🤝', title: 'MCFD / CLBC reporting', minLevel: 3 },
];
export const areaTitle = (k) => AREAS.find((a) => a.key === k)?.title ?? k;

export const STATUS = {
  green: { dot: '🟢', label: 'On target' },
  yellow: { dot: '🟡', label: 'Attention required' },
  red: { dot: '🔴', label: 'Immediate action' },
  none: { dot: '⚪', label: 'No data yet' },
};

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
// % KPI: green at/above target, yellow within `band` points, red below.
function pctStatus(value, target = 100, band = 5) {
  if (value === null || value === undefined) return 'none';
  if (value >= target) return 'green';
  return value >= target - band ? 'yellow' : 'red';
}
// Count KPI: any overdue = red, anything due soon = yellow, otherwise green.
const countStatus = (overdue, soon = 0) => (overdue > 0 ? 'red' : soon > 0 ? 'yellow' : 'green');
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

async function q(promise) {
  try { const { data, error } = await promise; return error ? null : (data ?? []); } catch { return null; }
}

// ---------------------------------------------------------------- data
export async function loadKpiData(supabase) {
  const today = todayISO();
  const yStart = today.slice(0, 4) + '-01-01';
  const mStart = today.slice(0, 7) + '-01';
  const ago30 = addDaysISO(today, -30);
  const wk = weekStart(today);
  const in7 = addDaysISO(today, 6);

  let [homes, residents, profiles, details, certs, trainings, incYear, incOpen, meds, mar, appts,
    shifts, timeWeek, timePending, timeMonth, drills, records, policies, versions, acks, onboardings, reqs, goals, kpiOwnerRows] = await Promise.all([
    q(supabase.from('homes').select('id, name, capacity').order('name')),
    q(supabase.from('residents').select('*')),
    q(supabase.from('profiles').select('id, full_name, role, level, staff_group, home_id, active')),
    q(supabase.from('staff_details').select('profile_id, program, hire_date')),
    q(supabase.from('certifications').select('id, profile_id, cert_type, expires_on')),
    q(supabase.from('trainings').select('profile_id, title, completed_on, expires_on, verified_by')),
    q(supabase.from('incidents').select('id, resident_id, home_id, occurred_on, incident_type, incident_class, is_critical, is_urgent, written_report_sent_on, internal_review_on, physical_intervention, status, residents(funder, care_type, first_name, last_name, preferred_name)').gte('occurred_on', yStart)),
    q(supabase.from('incidents').select('id, resident_id, home_id, occurred_on, incident_type, incident_class, is_critical, is_urgent, written_report_sent_on, internal_review_on, physical_intervention, status, residents(funder, care_type, first_name, last_name, preferred_name)').eq('status', 'Open')),
    q(supabase.from('medications').select('id, resident_id, times, start_date, end_date, active, is_prn').eq('is_prn', false)),
    q(supabase.from('med_administrations').select('medication_id, resident_id, admin_date, scheduled_time, status').gte('admin_date', ago30)),
    q(supabase.from('appointments').select('id, resident_id, home_id, appt_date, status').gte('appt_date', ago30).lte('appt_date', today)),
    q(supabase.from('shifts').select('id, home_id, profile_id, shift_date, start_time, end_time').gte('shift_date', addDaysISO(today, -1)).lte('shift_date', in7)),
    q(supabase.from('time_entries').select('profile_id, clock_in, clock_out, break_minutes').gte('clock_in', wk)),
    q(supabase.from('time_entries').select('id, profile_id, clock_in').not('clock_out', 'is', null).is('approved_at', null)),
    q(supabase.from('time_entries').select('profile_id, clock_in, clock_out, break_minutes, approved_at').gte('clock_in', mStart)),
    q(supabase.from('entries').select('home_id, kind, entry_date').in('kind', ['fire_drill', 'safety_check']).gte('entry_date', mStart)),
    q(supabase.from('records').select('id, division, area, title, status, due_date, home_id, resident_id, record_type, record_date')),
    q(supabase.from('policies').select('id, title, applies_to, current_version_id, require_signature, active').eq('active', true)),
    q(supabase.from('policy_versions').select('id, policy_id, published_at')),
    q(supabase.from('policy_acks').select('policy_version_id, profile_id')),
    q(supabase.from('onboardings').select('id, profile_id, status, due_date')),
    q(supabase.from('resident_requirements').select('*')),
    q(supabase.from('goals').select('resident_id, status').eq('status', 'Active')),
    q(supabase.from('kpi_owners').select('kpi_key, owner_id, assigned_by, assigned_at')),
  ]);

  // Before supabase/staff-groups.sql is run there is no staff_group column.
  if (profiles === null) profiles = await q(supabase.from('profiles').select('id, full_name, role, level, home_id, active'));

  const incMap = new Map();
  for (const i of [...(incYear ?? []), ...(incOpen ?? [])]) incMap.set(i.id, i);

  return {
    today, yStart, mStart, wk, in7,
    homes, residents, profiles, details, certs, trainings,
    incidents: incYear === null && incOpen === null ? null : [...incMap.values()],
    meds, mar, appts, shifts, timeWeek, timePending, timeMonth, drills, records,
    policies, versions, acks, onboardings, reqs, goals,
    kpiOwnerRows: kpiOwnerRows ?? [],
    kpiOwners: Object.fromEntries((kpiOwnerRows ?? []).filter((r) => r.owner_id).map((r) => [r.kpi_key, r.owner_id])),
  };
}

// ---------------------------------------------------------------- helpers
function quarterStart(iso) {
  const y = iso.slice(0, 4); const m = Number(iso.slice(5, 7));
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
}
const resName = (r) => (r ? `${r.preferred_name || r.first_name} ${r.last_name ?? ''}`.trim() : 'Resident');
const hoursOf = (t) => (t.clock_out ? Math.max(0, (new Date(t.clock_out) - new Date(t.clock_in)) / 3600000 - (t.break_minutes ?? 0) / 60) : 0);
const isStaff = (p) => p.active && p.role !== 'family';
// Mandatory training and policy sign-off apply to care staff and managers (levels 1-7), not system Administrators.
const isCareStaff = (p) => isStaff(p) && levelOf(p) < 8;
const active = (r) => r.status !== 'discharged';

function staffTraining(d) {
  // For each active staff member: required trainings that are due, and how many are current.
  const byP = {};
  for (const t of d.trainings ?? []) (byP[t.profile_id] ??= []).push(t);
  const det = Object.fromEntries((d.details ?? []).map((x) => [x.profile_id, x]));
  const out = [];
  for (const p of (d.profiles ?? []).filter(isCareStaff)) {
    const info = det[p.id] ?? {};
    let required = 0, current = 0;
    const overdue = [], soon = [];
    for (const item of trainingsFor(info.program).filter((t) => !t.ifApplicable)) {
      const dueBy = info.hire_date ? addDaysISO(info.hire_date, item.days ?? 0) : null;
      const st = trainingStatus(byP[p.id] ?? [], item.title, d.today);
      const isDue = !dueBy || dueBy <= d.today;
      if (!isDue && st.key === 'missing') continue; // still within the new-hire window
      required++;
      if (st.key === 'ok' || st.key === 'soon') current++;
      if (st.key === 'soon') soon.push({ item, st });
      if (st.key === 'expired' || (st.key === 'missing' && isDue)) overdue.push({ item, st });
    }
    out.push({ p, required, current, overdue, soon });
  }
  return out;
}

function policyStatus(d) {
  // Signatures on the current version of each active policy, for staff it applies to.
  const det = Object.fromEntries((d.details ?? []).map((x) => [x.profile_id, x]));
  const ver = Object.fromEntries((d.versions ?? []).map((v) => [v.id, v]));
  const signed = new Set((d.acks ?? []).map((a) => `${a.policy_version_id}:${a.profile_id}`));
  const applies = (pol, prog) => { const i = pol.applies_to ?? 'Both', p = prog ?? 'Both'; return i === 'Both' || p === 'Both' || i === p; };
  let need = 0, have = 0;
  const lateBy = {}; // profile -> count unsigned 14+ days after publishing
  for (const pol of (d.policies ?? []).filter((x) => x.require_signature && x.current_version_id)) {
    const v = ver[pol.current_version_id];
    for (const p of (d.profiles ?? []).filter(isCareStaff)) {
      if (!applies(pol, det[p.id]?.program)) continue;
      need++;
      if (signed.has(`${pol.current_version_id}:${p.id}`)) have++;
      else if (v && daysBetween(v.published_at.slice(0, 10), d.today) > 14) lateBy[p.id] = (lateBy[p.id] ?? 0) + 1;
    }
  }
  return { need, have, lateBy };
}

function marStatus(d) {
  // Scheduled doses in the last 7 full days (plus today's past times) vs doses signed.
  const signed = new Set((d.mar ?? []).filter((m) => m.scheduled_time).map((m) => `${m.medication_id}:${m.admin_date}:${m.scheduled_time}`));
  const now = nowTime();
  let expected = 0, got = 0;
  const missingToday = {}; // resident -> count (over 1 hour late)
  const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  for (const m of (d.meds ?? []).filter((x) => x.active)) {
    for (let i = 0; i <= 7; i++) {
      const day = addDaysISO(d.today, -i);
      if (m.start_date && m.start_date > day) continue;
      if (m.end_date && m.end_date < day) continue;
      for (const t of m.times ?? []) {
        if (i === 0 && mins(now) - mins(t) <= 60) continue; // not late yet
        expected++;
        if (signed.has(`${m.id}:${day}:${t}`)) got++;
        else if (i === 0) missingToday[m.resident_id] = (missingToday[m.resident_id] ?? 0) + 1;
      }
    }
  }
  return { expected, got, missingToday };
}

// ---------------------------------------------------------------- KPIs
export function computeKpis(d) {
  const today = d.today;
  const qStart = quarterStart(today);
  const K = [];
  const add = (k) => K.push({ minLevel: AREAS.find((a) => a.key === k.area)?.minLevel ?? 3, ...k });
  const noData = (x) => x === null || x === undefined;

  const residents = (d.residents ?? []).filter(active);
  const rById = Object.fromEntries((d.residents ?? []).map((r) => [r.id, r]));
  const homes = d.homes ?? [];

  // 1. CLIENT / RESIDENT CARE ------------------------------------------
  if (!noData(d.incidents)) {
    const open = d.incidents.filter((i) => i.status === 'Open');
    const lateWritten = open.filter((i) => i.is_critical && !i.written_report_sent_on && writtenDue(i, programsFor(i.residents ?? {})[0]?.key ?? 'mcfd') < today);
    add({ key: 'open_incidents', area: 'care', label: 'Open incidents', value: open.length, target: 'All closed on time',
      status: lateWritten.length ? 'red' : open.length ? 'yellow' : 'green',
      detail: lateWritten.length ? `${lateWritten.length} with a written report overdue` : open.length ? 'Open — follow up and close' : 'None open', href: '/dashboard' });
    const qc = d.incidents.filter((i) => i.occurred_on >= qStart && i.is_critical);
    add({ key: 'critical_incidents', area: 'care', label: 'Critical incidents this quarter', value: qc.length, target: 'Decreasing trend', status: qc.length ? 'yellow' : 'green', detail: `${qc.filter((i) => i.physical_intervention).length} with physical intervention`, href: '/portal/qa' });
  }
  if (!noData(d.mar)) {
    const mStart = d.mStart;
    const errs = d.mar.filter((m) => m.status === 'Error' && m.admin_date >= mStart).length;
    add({ key: 'med_errors', area: 'care', label: 'Medication errors this month', value: errs, target: '0', status: errs === 0 ? 'green' : errs === 1 ? 'yellow' : 'red', detail: errs ? 'Review each error and file an incident if it reached the resident' : 'No errors recorded', href: '/dashboard' });
  }
  if (!noData(d.meds) && !noData(d.mar)) {
    const m = marStatus(d);
    const v = pct(m.got, m.expected);
    add({ key: 'mar_complete', area: 'care', label: 'Medication documentation (last 7 days)', value: v === null ? '—' : `${v}%`, num: v, target: '100%',
      status: pctStatus(v, 100, 2), detail: m.expected ? `${m.expected - m.got} of ${m.expected} scheduled doses not signed` : 'No scheduled medications', href: '/dashboard' });
  }
  if (!noData(d.appts)) {
    const past = d.appts.filter((a) => a.status !== 'Cancelled' && a.appt_date < today);
    const done = past.filter((a) => a.status === 'Done').length;
    const v = pct(done, past.length);
    add({ key: 'appts_done', area: 'care', label: 'Appointments completed (30 days)', value: v === null ? '—' : `${v}%`, num: v, target: '100%', status: pctStatus(v, 100, 10),
      detail: past.length ? `${past.length - done} not marked done` : 'No appointments in the last 30 days', href: '/calendar' });
  }
  if (residents.length) {
    const due = residents.filter((r) => r.care_plan_review_date && r.care_plan_review_date < today).length;
    const soon = residents.filter((r) => r.care_plan_review_date && r.care_plan_review_date >= today && daysBetween(today, r.care_plan_review_date) <= DUE_WARN_DAYS).length;
    const missing = residents.filter((r) => !r.care_plan_review_date).length;
    const current = residents.length - due - missing;
    const v = pct(current, residents.length);
    add({ key: 'care_plans', area: 'care', label: 'Care plans current', value: `${v}%`, num: v, target: '100%',
      status: due || missing ? (v >= 95 ? 'yellow' : 'red') : soon ? 'yellow' : 'green',
      detail: [due && `${due} review overdue`, missing && `${missing} with no review date`, soon && `${soon} due in ${DUE_WARN_DAYS} days`].filter(Boolean).join(' · ') || 'All reviews up to date', href: '/homes' });
  }
  if (!noData(d.records)) {
    const c = d.records.filter((r) => r.record_type === 'Complaint' && !['Complete', 'N/A'].includes(r.status));
    const late = c.filter((r) => r.due_date && r.due_date < today).length;
    add({ key: 'complaints', area: 'care', label: 'Open complaints', value: c.length, target: 'Resolved on time', status: countStatus(late, c.length), detail: late ? `${late} past the response date` : c.length ? 'Open, within time' : 'None open', href: '/portal/program/std-b' });
  }

  // 2. STAFFING ---------------------------------------------------------
  if (!noData(d.shifts)) {
    const next = d.shifts.filter((s) => s.shift_date >= today && s.shift_date <= d.in7);
    const filled = next.filter((s) => s.profile_id).length;
    const v = pct(filled, next.length);
    add({ key: 'shift_coverage', area: 'staffing', label: 'Shift coverage (next 7 days)', value: v === null ? '—' : `${v}%`, num: v, target: '100%', status: pctStatus(v, 100, 5),
      detail: next.length ? `${next.length - filled} open shift${next.length - filled === 1 ? '' : 's'}` : 'No shifts scheduled', href: '/schedule' });
  }
  if (!noData(d.timeWeek)) {
    const byP = {};
    for (const t of d.timeWeek) byP[t.profile_id] = (byP[t.profile_id] ?? 0) + hoursOf(t);
    const over = Object.values(byP).filter((h) => h > 40).length;
    add({ key: 'overtime_week', area: 'staffing', label: 'Staff over 40 hours this week', value: over, target: '0', status: over === 0 ? 'green' : over <= 2 ? 'yellow' : 'red', detail: 'From clock-in / clock-out', href: '/timesheet' });
  }
  if (!noData(d.certs) && !noData(d.profiles)) {
    const activeIds = new Set(d.profiles.filter(isStaff).map((p) => p.id));
    const mine = d.certs.filter((c) => activeIds.has(c.profile_id) && c.expires_on);
    const expired = mine.filter((c) => c.expires_on < today).length;
    const soon = mine.filter((c) => c.expires_on >= today && daysBetween(today, c.expires_on) <= EXPIRY_WARN_DAYS).length;
    const v = pct(mine.length - expired, mine.length);
    add({ key: 'credentials', area: 'staffing', label: 'Credentials current', value: v === null ? '—' : `${v}%`, num: v, target: '100%', status: countStatus(expired, soon),
      detail: [expired && `${expired} expired`, soon && `${soon} expire within ${EXPIRY_WARN_DAYS} days`].filter(Boolean).join(' · ') || 'All current', href: '/hr' });
  }
  if (!noData(d.timePending)) {
    const old3 = d.timePending.filter((t) => daysBetween(t.clock_in.slice(0, 10), today) > 3).length;
    const old7 = d.timePending.filter((t) => daysBetween(t.clock_in.slice(0, 10), today) > 7).length;
    add({ key: 'timesheets_pending', area: 'staffing', label: 'Time entries waiting for approval', value: d.timePending.length, target: 'Approved within 3 days', status: old7 ? 'red' : old3 ? 'yellow' : 'green', detail: old3 ? `${old3} older than 3 days` : 'Up to date', href: '/timesheet' });
  }

  // 3. COMPLIANCE --------------------------------------------------------
  if (!noData(d.policies) && !noData(d.acks)) {
    const p = policyStatus(d);
    const v = pct(p.have, p.need);
    add({ key: 'policy_signoff', area: 'compliance', label: 'Policy sign-offs (current versions)', value: v === null ? '—' : `${v}%`, num: v, target: '100%', status: pctStatus(v, 100, 5),
      detail: p.need ? `${p.need - p.have} signature${p.need - p.have === 1 ? '' : 's'} outstanding` : 'No policies need signing', href: '/policies/report' });
  }
  if (!noData(d.records)) {
    const open = d.records.filter((r) => !['Complete', 'N/A'].includes(r.status) && r.due_date);
    const late = open.filter((r) => r.due_date < today).length;
    const soon = open.filter((r) => r.due_date >= today && daysBetween(today, r.due_date) <= DUE_WARN_DAYS).length;
    add({ key: 'outstanding_docs', area: 'compliance', label: 'Outstanding documentation (portal records)', value: late, target: '0 overdue', status: countStatus(late, soon),
      detail: `${late} overdue · ${soon} due in ${DUE_WARN_DAYS} days`, href: '/portal' });
    const cap = d.records.filter((r) => r.division === 'qa' && r.area === 'cap');
    const capOpen = cap.filter((r) => !['Complete', 'N/A'].includes(r.status));
    const capLate = capOpen.filter((r) => r.due_date && r.due_date < today).length;
    add({ key: 'corrective_actions', area: 'compliance', label: 'Corrective actions open', value: capOpen.length, target: '0 past due', status: countStatus(capLate, capOpen.filter((r) => r.due_date && daysBetween(today, r.due_date) <= DUE_WARN_DAYS && r.due_date >= today).length),
      detail: capLate ? `${capLate} past due` : 'None past due', href: '/portal/qa/cap' });
  }

  // 4. HEALTH & SAFETY ----------------------------------------------------
  if (!noData(d.drills) && homes.length) {
    const day = Number(today.slice(8, 10));
    for (const kind of [['fire_drill', 'Fire drills this month', 'fire_drills'], ['safety_check', 'Safety checks this month', 'safety_checks']]) {
      const done = new Set(d.drills.filter((x) => x.kind === kind[0]).map((x) => x.home_id));
      const missing = homes.filter((h) => !done.has(h.id)).length;
      const v = pct(homes.length - missing, homes.length);
      add({ key: kind[2], area: 'safety', label: kind[1], value: `${homes.length - missing} / ${homes.length} houses`, num: v, target: 'Every house, monthly',
        status: missing === 0 ? 'green' : day > 20 ? 'red' : 'yellow', detail: missing ? `${missing} house${missing === 1 ? '' : 's'} still to do` : 'All houses done', href: '/homes' });
    }
  }
  if (!noData(d.incidents)) {
    const restraints = d.incidents.filter((i) => i.occurred_on >= qStart && i.physical_intervention).length;
    add({ key: 'restraints', area: 'safety', label: 'Physical interventions this quarter', value: restraints, target: '0 preferred', status: restraints === 0 ? 'green' : restraints <= 2 ? 'yellow' : 'red', detail: 'Restraint is a last resort only', href: '/portal/qa' });
  }

  // 5. QUALITY ASSURANCE -------------------------------------------------
  if (!noData(d.incidents)) {
    const crit = d.incidents.filter((i) => i.occurred_on >= qStart && i.is_critical);
    const onTime = crit.filter((i) => i.written_report_sent_on && i.written_report_sent_on <= writtenDue(i, programsFor(i.residents ?? {})[0]?.key ?? 'mcfd')).length;
    const v = pct(onTime, crit.length);
    add({ key: 'critical_on_time', area: 'qa', label: 'Critical reports sent on time (quarter)', value: v === null ? '—' : `${v}%`, num: v ?? (crit.length ? 0 : 100), target: '100%', status: crit.length ? pctStatus(v, 100, 0) : 'green', detail: `${onTime} of ${crit.length}`, href: '/portal/qa' });
    const due = d.incidents.filter((i) => reviewDue(i) < today && i.occurred_on >= qStart);
    const reviewed = due.filter((i) => i.internal_review_on && i.internal_review_on <= reviewDue(i)).length;
    const rv = pct(reviewed, due.length);
    add({ key: 'incident_reviews', area: 'qa', label: 'Incident reviews within 5 business days', value: rv === null ? '—' : `${rv}%`, num: rv ?? 100, target: '100%', status: due.length ? pctStatus(rv, 100, 10) : 'green', detail: `${reviewed} of ${due.length} this quarter`, href: '/dashboard' });
  }
  if (!noData(d.records)) {
    const cap = d.records.filter((r) => r.division === 'qa' && r.area === 'cap' && r.due_date && r.due_date < today);
    const v = pct(cap.filter((r) => r.status === 'Complete').length, cap.length);
    add({ key: 'cap_on_time', area: 'qa', label: 'Corrective actions completed by due date', value: v === null ? '—' : `${v}%`, num: v ?? 100, target: '100%', status: cap.length ? pctStatus(v, 100, 10) : 'green', detail: cap.length ? `${cap.length} due so far` : 'None due yet', href: '/portal/qa/cap' });
  }

  // 6. HR -------------------------------------------------------------------
  if (!noData(d.onboardings)) {
    const open = d.onboardings.filter((o) => o.status !== 'Complete');
    const late = open.filter((o) => o.due_date && o.due_date < today).length;
    const soon = open.filter((o) => o.due_date && o.due_date >= today && daysBetween(today, o.due_date) <= DUE_WARN_DAYS).length;
    add({ key: 'onboarding', area: 'hr', label: 'Onboarding in progress', value: open.length, target: 'Complete by due date', status: countStatus(late, soon), detail: late ? `${late} overdue` : soon ? `${soon} due within ${DUE_WARN_DAYS} days` : 'On track', href: '/hr' });
  }
  if (!noData(d.certs) && !noData(d.profiles)) {
    const activeIds = new Set(d.profiles.filter(isStaff).map((p) => p.id));
    const crc = d.certs.filter((c) => activeIds.has(c.profile_id) && /criminal/i.test(c.cert_type) && c.expires_on);
    const exp = crc.filter((c) => c.expires_on < today).length;
    const soon = crc.filter((c) => c.expires_on >= today && daysBetween(today, c.expires_on) <= EXPIRY_WARN_DAYS).length;
    add({ key: 'crc', area: 'hr', label: 'Criminal record checks current', value: `${crc.length - exp} / ${crc.length}`, num: pct(crc.length - exp, crc.length), target: 'All current', status: countStatus(exp, soon), detail: exp ? `${exp} expired` : soon ? `${soon} renew soon` : 'All current', href: '/hr' });
  }

  // 7. FINANCE (level 5+) ---------------------------------------------------
  if (!noData(d.timeMonth)) {
    const approved = d.timeMonth.filter((t) => t.approved_at).reduce((s, t) => s + hoursOf(t), 0);
    const all = d.timeMonth.reduce((s, t) => s + hoursOf(t), 0);
    add({ key: 'payroll_hours', area: 'finance', label: 'Payroll hours this month', value: Math.round(all), target: '—', status: 'none', detail: `${Math.round(approved)} approved · revenue & pay rates come in Phase 3`, href: '/timesheet' });
  }

  // 8. OPERATIONS -------------------------------------------------------------
  if (homes.length) {
    const cap = homes.reduce((s, h) => s + (h.capacity ?? 0), 0);
    add({ key: 'active_residents', area: 'operations', label: 'Active residents', value: residents.length, target: cap ? `${cap} beds` : 'Set bed capacity per house', status: 'none',
      detail: cap ? `Occupancy ${pct(residents.length, cap)}%` : 'Add capacity on each house to see occupancy', href: '/homes' });
  }
  if (!noData(d.shifts)) {
    const now = nowTime();
    const onDuty = d.shifts.filter((s) => {
      if (!s.profile_id) return false;
      const st = s.start_time.slice(0, 5), en = s.end_time.slice(0, 5);
      if (s.shift_date === today) return en > st ? now >= st && now < en : now >= st;
      if (s.shift_date === addDaysISO(today, -1)) return en <= st && now < en; // overnight from yesterday
      return false;
    }).length;
    add({ key: 'on_duty', area: 'operations', label: 'Staff on duty now', value: onDuty, target: '—', status: 'none', detail: 'From today’s schedule', href: '/schedule' });
  }

  // 9. TRAINING -----------------------------------------------------------------
  if (!noData(d.trainings) && !noData(d.profiles)) {
    const st = staffTraining(d);
    const req = st.reduce((s, x) => s + x.required, 0), cur = st.reduce((s, x) => s + x.current, 0);
    const overduePeople = st.filter((x) => x.overdue.length).length;
    const soonCount = st.reduce((s, x) => s + x.soon.length, 0);
    const v = pct(cur, req);
    add({ key: 'training', area: 'training', label: 'Mandatory training compliance', value: v === null ? '—' : `${v}%`, num: v, target: '100%', status: v === null ? 'none' : overduePeople ? pctStatus(v, 100, 5) === 'green' ? 'yellow' : pctStatus(v, 100, 5) : soonCount ? 'yellow' : 'green',
      detail: [overduePeople && `${overduePeople} employee${overduePeople === 1 ? '' : 's'} overdue`, soonCount && `${soonCount} renewal${soonCount === 1 ? '' : 's'} within ${EXPIRY_WARN_DAYS} days`].filter(Boolean).join(' · ') || 'All current', href: '/academy' });
  }

  // 10. MCFD / CLBC REPORTING ---------------------------------------------------
  if (!noData(d.incidents)) {
    const open = d.incidents.filter((i) => i.status === 'Open' && i.is_critical && !i.written_report_sent_on);
    const late = open.filter((i) => writtenDue(i, programsFor(i.residents ?? {})[0]?.key ?? 'mcfd') < today).length;
    add({ key: 'reports_due', area: 'mcfd', label: 'Critical incident reports to funder', value: open.length, target: 'Sent by deadline', status: countStatus(late, open.length - late), detail: late ? `${late} OVERDUE` : open.length ? 'Due soon' : 'None outstanding', href: '/dashboard' });
  }
  if (!noData(d.reqs) && residents.length) {
    const recs = {};
    for (const x of d.reqs) recs[`${x.resident_id}:${x.req_key}`] = x;
    let overdue = 0, soon = 0, total = 0, done = 0;
    for (const r of residents) for (const p of programsFor(r)) for (const s of p.sections) for (const it of s.items) {
      const st = itemState(it, recs[`${r.id}:${it.key}`], r, today);
      if (!st.applies) continue;
      total++; if (st.done) done++;
      if (st.flag === 'overdue') overdue++; else if (st.flag === 'soon') soon++;
    }
    add({ key: 'contract_reqs', area: 'mcfd', label: 'Contract / standards requirements met', value: `${pct(done, total) ?? 0}%`, num: pct(done, total), target: '100%', status: countStatus(overdue, soon), detail: `${overdue} overdue · ${soon} due in 14 days`, href: '/homes' });
  }
  return K;
}

// What the viewer may see.
// Which KPIs a person sees: by level (each area has a minimum level); HR and Payroll see their own
// areas; everyone also sees any KPI they have been made the owner of.
export function visibleKpis(kpis, profile, owners) {
  const lvl = levelOf(profile);
  const group = GROUPS.find((g) => g.key === groupOf(profile));
  const mine = (k) => owners && profile && owners[k.key] === profile.id;
  if (group) return kpis.filter((k) => group.areas.includes(k.area) || mine(k));
  return kpis.filter((k) => lvl >= k.minLevel || mine(k));
}

// Suggested owner for each KPI, by access level (2-8) or department (hr / payroll).
// Used by "Fill in owners by role" on the KPI owners page. Levels 4-7 each own their own KPIs.
export const DEFAULT_KPI_ROLE = {
  // 2 · Program Coordinator — day-to-day house care
  mar_complete: 2, appts_done: 2, care_plans: 2, fire_drills: 2, safety_checks: 2, outstanding_docs: 2,
  // 3 · Program Manager — incidents and staffing across houses
  open_incidents: 3, incident_reviews: 3, med_errors: 3, shift_coverage: 3, on_duty: 3,
  // 4 · Director of Operations — operations, safety and occupancy
  critical_incidents: 4, restraints: 4, complaints: 4, active_residents: 4,
  // 5 · Executive Director — payroll cost and overtime
  payroll_hours: 5, overtime_week: 5,
  // 6 · CSO — contracts, standards and quality
  contract_reqs: 6, corrective_actions: 6, cap_on_time: 6, critical_on_time: 6,
  // 7 · CEO — funder (MCFD / CLBC) reporting
  reports_due: 7,
  // HR — people, credentials and training
  credentials: 'hr', policy_signoff: 'hr', onboarding: 'hr', crc: 'hr', training: 'hr',
  // Payroll — timesheets
  timesheets_pending: 'payroll',
};
// Pick a person for a role: someone in that department / at that level; else the next level up.
export function personForRole(role, profiles) {
  const staff = (profiles ?? []).filter(isStaff);
  if (typeof role === 'string') {
    const p = staff.find((x) => groupOf(x) === role);
    if (p) return p.id;
    role = role === 'hr' ? 3 : 5; // no HR person yet -> Program Manager; no Payroll -> Executive Director
  }
  for (let l = role; l <= 8; l++) {
    const p = staff.find((x) => !groupOf(x) && levelOf(x) === l);
    if (p) return p.id;
  }
  return null;
}

// Monthly scorecard rows (live; the daily job saves them to kpi_snapshots for the monthly trend).
export const SCORECARD = [
  { label: 'Client safety', keys: ['mar_complete', 'critical_on_time', 'incident_reviews'], target: 100 },
  { label: 'Staffing', keys: ['shift_coverage', 'credentials'], target: 95 },
  { label: 'Training', keys: ['training'], target: 100 },
  { label: 'Documentation', keys: ['care_plans', 'appts_done', 'policy_signoff'], target: 100 },
  { label: 'Compliance', keys: ['contract_reqs', 'cap_on_time'], target: 100 },
  { label: 'Health & safety', keys: ['fire_drills', 'safety_checks'], target: 100 },
  { label: 'Client satisfaction', keys: [], target: 90, note: 'Survey added in Phase 3' },
];
export function scorecard(kpis) {
  const by = Object.fromEntries(kpis.map((k) => [k.key, k]));
  return SCORECARD.map((row) => {
    const vals = row.keys.map((k) => by[k]?.num).filter((v) => typeof v === 'number');
    const actual = vals.length ? Math.round((10 * vals.reduce((a, b) => a + b, 0)) / vals.length) / 10 : null;
    return { ...row, actual, status: actual === null ? 'none' : pctStatus(actual, row.target, 5) };
  });
}
export function overallCompliance(kpis) {
  const vals = kpis.filter((k) => typeof k.num === 'number' && k.target?.includes?.('%')).map((k) => k.num);
  return vals.length ? Math.round((10 * vals.reduce((a, b) => a + b, 0)) / vals.length) / 10 : null;
}

// ---------------------------------------------------------------- ACTION REQUIRED scan
// Turns problems into issues. Each has a stable source_key so the same problem
// becomes one action item (not a new one every scan).
export function detectIssues(d) {
  const today = d.today;
  const I = [];
  const add = (x) => I.push({ severity: 'yellow', ...x });
  const rById = Object.fromEntries((d.residents ?? []).map((r) => [r.id, r]));
  const pById = Object.fromEntries((d.profiles ?? []).map((p) => [p.id, p]));
  const activeIds = new Set((d.profiles ?? []).filter(isStaff).map((p) => p.id));

  for (const c of d.certs ?? []) {
    if (!activeIds.has(c.profile_id) || !c.expires_on) continue;
    const days = daysBetween(today, c.expires_on);
    if (days > EXPIRY_WARN_DAYS) continue;
    add({ source_key: `cert:${c.id}:${c.expires_on}`, category: 'hr', kind: 'staff', subject_profile_id: c.profile_id,
      title: `${pById[c.profile_id]?.full_name ?? 'Staff'}: ${c.cert_type} ${days < 0 ? 'EXPIRED' : `expires in ${days} day${days === 1 ? '' : 's'}`}`,
      due_date: c.expires_on, severity: days < 0 ? 'red' : 'yellow', link: `/hr/${c.profile_id}` });
  }
  for (const r of (d.residents ?? []).filter(active)) {
    if (!r.care_plan_review_date) continue;
    const days = daysBetween(today, r.care_plan_review_date);
    if (days > DUE_WARN_DAYS) continue;
    add({ source_key: `careplan:${r.id}:${r.care_plan_review_date}`, category: 'care', home_id: r.home_id, resident_id: r.id,
      title: `${resName(r)}: care plan review ${days < 0 ? 'OVERDUE' : `due in ${days} day${days === 1 ? '' : 's'}`}`, due_date: r.care_plan_review_date, severity: days < 0 ? 'red' : 'yellow', link: `/residents/${r.id}` });
  }
  for (const i of (d.incidents ?? []).filter((x) => x.status === 'Open')) {
    const who = resName(i.residents);
    if (i.is_critical && !i.written_report_sent_on) {
      const due = writtenDue(i, programsFor(i.residents ?? {})[0]?.key ?? 'mcfd');
      add({ source_key: `inc-written:${i.id}`, category: 'mcfd', home_id: i.home_id, resident_id: i.resident_id,
        title: `${who}: written incident report to funder ${due < today ? 'OVERDUE' : 'due'} (${i.incident_type})`, due_date: due, severity: due < today ? 'red' : 'yellow', link: `/residents/${i.resident_id}?tab=incidents` });
    }
    if (!i.internal_review_on) {
      const due = reviewDue(i);
      if (daysBetween(today, due) <= DUE_WARN_DAYS)
        add({ source_key: `inc-review:${i.id}`, category: 'qa', home_id: i.home_id, resident_id: i.resident_id,
          title: `${who}: incident report incomplete — internal review ${due < today ? 'overdue' : 'due'}`, due_date: due, severity: due < today ? 'red' : 'yellow', link: `/residents/${i.resident_id}?tab=incidents` });
    }
  }
  if (d.meds && d.mar) {
    for (const [rid, n] of Object.entries(marStatus(d).missingToday)) {
      const r = rById[rid];
      add({ source_key: `mar:${rid}:${today}`, category: 'care', home_id: r?.home_id, resident_id: rid, title: `${resName(r)}: ${n} medication dose${n > 1 ? 's' : ''} not documented today`, due_date: today, severity: 'red', link: `/residents/${rid}?tab=mar` });
    }
  }
  if (d.trainings && d.profiles) {
    // One item per person (not one per course), so a new hire doesn't create 20 items.
    for (const x of staffTraining(d)) {
      if (x.overdue.length) {
        const names = x.overdue.map((o) => o.item.title);
        add({ source_key: `trn-overdue:${x.p.id}`, category: 'training', kind: 'staff', subject_profile_id: x.p.id,
          title: `${x.p.full_name}: ${names.length} mandatory training${names.length === 1 ? '' : 's'} overdue`, details: names.join('\n'), due_date: today, severity: 'red', link: `/hr/${x.p.id}` });
      }
      if (x.soon.length) {
        const first = x.soon.map((o) => o.st.last?.expires_on).filter(Boolean).sort()[0];
        add({ source_key: `trn-soon:${x.p.id}`, category: 'training', kind: 'staff', subject_profile_id: x.p.id,
          title: `${x.p.full_name}: ${x.soon.length} training renewal${x.soon.length === 1 ? '' : 's'} due within ${EXPIRY_WARN_DAYS} days`, details: x.soon.map((o) => `${o.item.title} — ${o.st.label}`).join('\n'), due_date: first, link: `/hr/${x.p.id}` });
      }
    }
  }
  if (d.drills && d.homes) {
    const day = Number(today.slice(8, 10));
    const monthEnd = addDaysISO(addDaysISO(d.mStart, 32).slice(0, 7) + '-01', -1);
    if (day >= 15) {
      const done = new Set(d.drills.filter((x) => x.kind === 'fire_drill').map((x) => x.home_id));
      for (const h of d.homes.filter((h) => !done.has(h.id)))
        add({ source_key: `drill:${h.id}:${today.slice(0, 7)}`, category: 'safety', home_id: h.id, title: `${h.name}: emergency (fire) drill due this month`, due_date: monthEnd, severity: day > 20 ? 'red' : 'yellow', link: `/homes/${h.id}?tab=safety` });
    }
  }
  if (d.policies && d.acks) {
    for (const [pid, n] of Object.entries(policyStatus(d).lateBy))
      add({ source_key: `policies:${pid}`, category: 'compliance', kind: 'staff', subject_profile_id: pid, title: `${pById[pid]?.full_name ?? 'Staff'}: ${n} polic${n === 1 ? 'y' : 'ies'} not signed (over 14 days)`, due_date: today, link: `/policies` });
  }
  for (const o of (d.onboardings ?? []).filter((o) => o.status !== 'Complete' && o.due_date && daysBetween(today, o.due_date) <= DUE_WARN_DAYS))
    add({ source_key: `onb:${o.id}`, category: 'hr', kind: 'staff', subject_profile_id: o.profile_id, title: `${pById[o.profile_id]?.full_name ?? 'New hire'}: onboarding ${o.due_date < today ? 'overdue' : 'due soon'}`, due_date: o.due_date, severity: o.due_date < today ? 'red' : 'yellow', link: `/hr/${o.profile_id}/onboarding` });
  for (const r of (d.records ?? []).filter((r) => !['Complete', 'N/A'].includes(r.status) && r.due_date && daysBetween(today, r.due_date) <= DUE_WARN_DAYS)) {
    const isCap = r.division === 'qa' && r.area === 'cap';
    add({ source_key: `rec:${r.id}`, category: isCap ? 'qa' : 'compliance', home_id: r.home_id, resident_id: r.resident_id,
      title: `${isCap ? 'Corrective action' : r.record_type || 'Record'}: ${r.title} — ${r.due_date < today ? 'past due' : 'due soon'}`, due_date: r.due_date, severity: r.due_date < today ? 'red' : 'yellow', link: `/portal/record/${r.id}` });
  }
  if (d.reqs && d.residents) {
    const recs = {};
    for (const x of d.reqs) recs[`${x.resident_id}:${x.req_key}`] = x;
    for (const r of (d.residents ?? []).filter(active)) {
      let overdue = 0;
      for (const p of programsFor(r)) for (const s of p.sections) for (const it of s.items) {
        const st = itemState(it, recs[`${r.id}:${it.key}`], r, today);
        if (st.applies && st.flag === 'overdue') overdue++;
      }
      if (overdue) add({ source_key: `req:${r.id}`, category: 'mcfd', home_id: r.home_id, resident_id: r.id, title: `${resName(r)}: ${overdue} required document${overdue > 1 ? 's' : ''} missing or overdue`, due_date: today, severity: 'red', link: `/residents/${r.id}?tab=requirements` });
    }
  }
  if (d.timePending) {
    const old = d.timePending.filter((t) => daysBetween(t.clock_in.slice(0, 10), today) > 3).length;
    if (old) add({ source_key: 'timesheets-pending', category: 'staffing', title: `${old} time entr${old === 1 ? 'y' : 'ies'} waiting over 3 days for approval`, due_date: today, link: '/timesheet' });
  }
  return I;
}

// Which KPI an action-required issue belongs to (so the KPI's assigned owner gets it).
const ISSUE_KPI = {
  cert: 'credentials', careplan: 'care_plans', 'inc-written': 'critical_on_time', 'inc-review': 'incident_reviews',
  mar: 'mar_complete', 'trn-overdue': 'training', 'trn-soon': 'training', drill: 'fire_drills', policies: 'policy_signoff',
  onb: 'onboarding', req: 'contract_reqs', 'timesheets-pending': 'timesheets_pending',
};
export function kpiKeyFor(issue) {
  const prefix = String(issue?.source_key ?? '').split(':')[0];
  if (prefix === 'rec') return issue.category === 'qa' ? 'corrective_actions' : 'outstanding_docs';
  return ISSUE_KPI[prefix] ?? null;
}

// Who should own an issue: the person the CEO / Director assigned to that KPI (KPI owners page);
// otherwise the house's Program Coordinator, else a Program Manager, else an Administrator.
// Staff-file items go to a Program Manager (HR).
export function pickOwner(issue, profiles, kpiOwners) {
  const staff = (profiles ?? []).filter(isStaff);
  const at = (lvl, home) => staff.filter((p) => !groupOf(p) && levelOf(p) === lvl && (!home || p.home_id === home));
  const assignedId = kpiOwners?.[kpiKeyFor(issue)];
  const assigned = staff.find((p) => p.id === assignedId);
  if (assigned) {
    // Executives (levels 4-7) are accountable for the KPI; a house-level fix still goes to that house's coordinator.
    const exec = !groupOf(assigned) && levelOf(assigned) >= 4 && levelOf(assigned) <= 7;
    if (exec && issue.kind !== 'staff' && issue.home_id) { const pc = at(2, issue.home_id)[0]; if (pc) return pc.id; }
    return assigned.id;
  }
  // Staff-file items go to HR when there is an HR person.
  if (issue.kind === 'staff') { const hr = staff.find((p) => groupOf(p) === 'hr'); if (hr) return hr.id; }
  if (issue.kind !== 'staff' && issue.home_id) {
    const pc = at(2, issue.home_id)[0]; if (pc) return pc.id;
  }
  for (let l = 3; l <= 8; l++) { const p = at(l)[0]; if (p) return p.id; }
  return null;
}
