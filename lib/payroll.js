// Payroll export (plan B2): approved hours for a pay period, split the way B.C. Employment Standards pays them.
//   Regular · Overtime 1.5x · Overtime 2x · Stat worked (1.5x) · Stat worked over 12 h (2x)
//   BC paid sick · Unpaid sick · Vacation · Banked time
// Daily overtime: over 8 hours in a shift-day at 1.5x, over 12 at 2x (the whole shift counts on the day it started).
// Weekly overtime: regular hours over 40 in a Sunday-to-Saturday week at 1.5x (ESA "week").
// Stat holidays: hours worked on the day at 1.5x (2x over 12). "Stat pay eligible" = worked on 15 of the 30 days before.
// Only APPROVED time entries are paid; anything not approved is listed so Payroll can chase it.
import { addDaysISO, TZ } from '@/lib/options';

export const localDate = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts));
const hoursOf = (e) => !e.clock_out ? 0 : Math.max(0, (new Date(e.clock_out) - new Date(e.clock_in)) / 3600000 - (e.break_minutes ?? 0) / 60);
const r2 = (n) => Math.round(n * 100) / 100;
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dow = (isoDate) => new Date(isoDate + 'T12:00:00Z').getUTCDay(); // 0 = Sunday

function nthWeekday(y, month, weekday, n) { // n-th weekday (0=Sun) of a month
  const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
  return iso(y, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
}
function easter(y) { // Anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
}

// B.C. statutory holidays (Employment Standards Act).
export function bcStatHolidays(y) {
  const may25 = new Date(Date.UTC(y, 4, 25)).getUTCDay();
  return [
    [iso(y, 1, 1), "New Year's Day"],
    [nthWeekday(y, 2, 1, 3), 'Family Day'],
    [addDaysISO(easter(y), -2), 'Good Friday'],
    [iso(y, 5, 25 - (may25 === 1 ? 7 : (may25 + 6) % 7)), 'Victoria Day'],
    [iso(y, 7, 1), 'Canada Day'],
    [nthWeekday(y, 8, 1, 1), 'B.C. Day'],
    [nthWeekday(y, 9, 1, 1), 'Labour Day'],
    [iso(y, 9, 30), 'National Day for Truth and Reconciliation'],
    [nthWeekday(y, 10, 1, 2), 'Thanksgiving Day'],
    [iso(y, 11, 11), 'Remembrance Day'],
    [iso(y, 12, 25), 'Christmas Day'],
  ];
}
export function statsBetween(start, end) {
  const ys = [...new Set([start.slice(0, 4), end.slice(0, 4)])].map(Number);
  return ys.flatMap(bcStatHolidays).filter(([d]) => d >= start && d <= end).map(([date, name]) => ({ date, name }));
}

export const COLUMNS = [
  ['regular', 'Regular'], ['ot15', 'Overtime 1.5x'], ['ot2', 'Overtime 2x'], ['stat15', 'Stat worked 1.5x'], ['stat2', 'Stat worked 2x'],
  ['sick_paid', 'BC paid sick'], ['sick_unpaid', 'Unpaid sick'], ['vacation', 'Vacation'], ['banked', 'Banked time'],
];

// entries: approved time entries from (period.start - 31 days) to (period.end + 7 days), with profile_id, clock_in, clock_out, break_minutes
// absences: shift_absences in the period (pay_type, hours, shift_date, profile_id)
// timeOff: approved time_off_requests overlapping the period
// people: [{ id, full_name, employee_no, position, program, hours_per_week, employment_type }]
export function buildPayroll({ period, entries, absences = [], timeOff = [], people = [] }) {
  const stats = statsBetween(addDaysISO(period.start, -31), period.end);
  const statSet = new Map(stats.map((s) => [s.date, s.name]));
  const inPeriod = (d) => d >= period.start && d <= period.end;
  const rows = new Map();
  const row = (pid) => {
    if (!rows.has(pid)) rows.set(pid, { profile_id: pid, ...Object.fromEntries(COLUMNS.map(([k]) => [k, 0])), shifts: 0, notes: [] });
    return rows.get(pid);
  };

  // Hours per person per shift-day.
  const byPerson = new Map();
  for (const e of entries) {
    if (!e.clock_out) continue;
    const d = localDate(e.clock_in);
    const m = byPerson.get(e.profile_id) ?? new Map();
    m.set(d, (m.get(d) ?? 0) + hoursOf(e));
    byPerson.set(e.profile_id, m);
  }

  for (const [pid, days] of byPerson) {
    // Daily split first.
    const split = new Map();
    for (const [d, h] of days) {
      if (statSet.has(d)) split.set(d, { reg: 0, ot15: 0, ot2: Math.max(0, h - 12), stat15: Math.min(h, 12), h });
      else split.set(d, { reg: Math.min(h, 8), ot15: Math.max(0, Math.min(h, 12) - 8), ot2: Math.max(0, h - 12), stat15: 0, h });
    }
    // Weekly: regular hours past 40 in a Sunday-Saturday week become 1.5x, on the day the 40 is crossed.
    const sorted = [...split.keys()].sort();
    let weekKey = null, weekReg = 0;
    for (const d of sorted) {
      const wk = addDaysISO(d, -dow(d));
      if (wk !== weekKey) { weekKey = wk; weekReg = 0; }
      const s = split.get(d);
      const over = Math.max(0, weekReg + s.reg - 40);
      weekReg += s.reg;
      if (over > 0) { const move = Math.min(over, s.reg); s.reg -= move; s.ot15 += move; }
    }
    for (const d of sorted) {
      if (!inPeriod(d)) continue;
      const s = split.get(d); const r = row(pid);
      r.regular += s.reg; r.ot15 += s.ot15;
      if (statSet.has(d)) { r.stat15 += s.stat15; r.stat2 += s.ot2; } else r.ot2 += s.ot2;
      r.shifts += 1;
    }
  }

  for (const a of absences) {
    if (!inPeriod(a.shift_date) || !a.pay_type || !a.hours) continue;
    const r = row(a.profile_id);
    const key = { 'BC paid sick': 'sick_paid', 'Unpaid sick': 'sick_unpaid', Vacation: 'vacation', 'Banked time': 'banked' }[a.pay_type];
    if (key) r[key] += Number(a.hours);
  }

  const pInfo = new Map(people.map((p) => [p.id, p]));
  for (const t of timeOff) {
    if (t.kind !== 'Vacation') continue;
    const daily = Number(pInfo.get(t.profile_id)?.hours_per_week || 36) / 5;
    let n = 0;
    for (let d = t.start_date > period.start ? t.start_date : period.start; d <= (t.end_date < period.end ? t.end_date : period.end); d = addDaysISO(d, 1)) {
      if (dow(d) !== 0 && dow(d) !== 6) n += 1;
    }
    if (n) { const r = row(t.profile_id); r.vacation += n * daily; r.notes.push(`Vacation ${n} weekday(s) at ${r2(daily)} h (from hours per week; check against the schedule)`); }
  }

  // Stat pay eligibility (ESA s.44): worked or earned wages on 15 of the 30 days before the holiday.
  const periodStats = stats.filter((s) => inPeriod(s.date));
  for (const s of periodStats) {
    for (const [pid, days] of byPerson) {
      let worked = 0;
      for (let i = 1; i <= 30; i++) if (days.has(addDaysISO(s.date, -i))) worked += 1;
      if (worked >= 15) row(pid).notes.push(`${s.name}: eligible for stat holiday pay (worked ${worked} of the 30 days before)`);
    }
  }

  const list = [...rows.values()].map((r) => {
    const p = pInfo.get(r.profile_id) ?? {};
    const out = { ...r, full_name: p.full_name ?? '—', employee_no: p.employee_no ?? '', position: p.position ?? '', program: p.program ?? '', employment_type: p.employment_type ?? '' };
    for (const [k] of COLUMNS) out[k] = r2(out[k]);
    out.total = r2(COLUMNS.reduce((a, [k]) => a + out[k], 0));
    return out;
  }).sort((a, b) => a.full_name.localeCompare(b.full_name));
  return { rows: list, stats: periodStats };
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function payrollCsv({ period, rows }) {
  const head = ['Employee no', 'Name', 'Position', 'Program', 'Employment type', 'Pay period start', 'Pay period end', 'Shifts',
    ...COLUMNS.map(([, l]) => `${l} hours`), 'Total hours', 'Notes'];
  const lines = rows.map((r) => [r.employee_no, r.full_name, r.position, r.program, r.employment_type, period.start, period.end, r.shifts,
    ...COLUMNS.map(([k]) => r[k].toFixed(2)), r.total.toFixed(2), r.notes.join('; ')]);
  return [head, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
