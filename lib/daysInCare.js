// Days-in-care report (plan E5): nights in care for each youth or adult, month by month, from their admission and
// discharge dates. The admission day counts; the discharge day doesn't (the usual billing count: one per night).
// Missing-youth episodes in the month are shown alongside (information only; billing rules come with the contract).
import { addDaysISO, todayISO } from '@/lib/options';

const lastOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);   // m is 1-12
const diffDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// Nights between start (inclusive) and endExclusive, clipped to [from, to] inclusive.
export function nightsIn(start, endExclusive, from, to) {
  const s = start > from ? start : from;
  const lastNight = addDaysISO(endExclusive, -1);
  const e = lastNight < to ? lastNight : to;
  return e < s ? 0 : diffDays(s, e) + 1;
}

export function buildDaysInCare({ year, residents, homes, missing = [] }) {
  const today = todayISO();
  const months = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, from: `${year}-${String(i + 1).padStart(2, '0')}-01`, to: lastOfMonth(year, i + 1) }));
  const homeName = new Map((homes ?? []).map((h) => [h.id, h.name]));
  const noDates = [];
  const rows = [];
  for (const r of residents ?? []) {
    if (!r.admission_date) { noDates.push(r); continue; }
    // Still in care: count up to and including today (tonight). Future months stay empty.
    const endExclusive = r.discharge_date ?? addDaysISO(today, 1);
    const perMonth = months.map((mo) => (mo.from > today ? null : nightsIn(r.admission_date, endExclusive, mo.from, mo.to < today ? mo.to : today)));
    const away = months.map((mo) => {
      let n = 0;
      for (const x of missing) {
        if (x.resident_id !== r.id || !x.started_at) continue;
        const s = x.started_at.slice(0, 10); const f = (x.found_at ?? x.closed_at ?? new Date().toISOString()).slice(0, 10);
        n += nightsIn(s, f, mo.from, mo.to);
      }
      return n;
    });
    const total = perMonth.reduce((a, b) => a + (b ?? 0), 0);
    if (total === 0 && r.discharge_date && r.discharge_date < `${year}-01-01`) continue;   // left before this year
    if (r.admission_date > `${year}-12-31`) continue;
    rows.push({
      id: r.id, name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(), file_number: r.file_number ?? '', home: homeName.get(r.home_id) ?? '—',
      program: r.program ?? '', funder: r.funder ?? '', care_type: r.care_type ?? '', admission_date: r.admission_date, discharge_date: r.discharge_date,
      perMonth, away, total, awayTotal: away.reduce((a, b) => a + b, 0),
    });
  }
  rows.sort((a, b) => a.home.localeCompare(b.home) || a.name.localeCompare(b.name));
  const byHome = {};
  for (const r of rows) {
    const h = (byHome[r.home] ??= { home: r.home, perMonth: months.map(() => 0), total: 0, people: 0 });
    r.perMonth.forEach((v, i) => { h.perMonth[i] += v ?? 0; });
    h.total += r.total; h.people += 1;
  }
  return { months, rows, homes: Object.values(byHome), noDates, today };
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function daysInCareCsv(year, data) {
  const head = ['Name', 'File number', 'House', 'Program', 'Funder', 'Care type', 'Admission date', 'Discharge date',
    ...MONTH_NAMES.map((m) => `${m} ${year} nights`), `Total ${year} nights`, `Nights missing ${year}`];
  const lines = data.rows.map((r) => [r.name, r.file_number, r.home, r.program, r.funder, r.care_type, r.admission_date, r.discharge_date ?? '',
    ...r.perMonth.map((v) => v ?? ''), r.total, r.awayTotal]);
  return [head, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export { MONTH_NAMES };
