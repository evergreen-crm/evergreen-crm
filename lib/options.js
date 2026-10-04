// Shared dropdown choices and date helpers.

export const HOUSE_TYPES = ['Children', 'Youth', 'Adults', 'Mixed'];
export const CARE_TYPES = ['Child', 'Youth', 'Adult'];
export const FUNDERS = [
  'MCFD (Children & Family Development)',
  'CLBC (Community Living BC)',
  'Health Authority',
  'Private pay',
  'Other',
];
export const RESIDENT_STATUSES = ['active', 'on leave', 'hospital', 'discharged'];
export const APPT_CATEGORIES = [
  'Medical', 'Dental', 'Mental health / Therapy', 'Social worker visit', 'Family visit',
  'School / Day program', 'Court / Legal', 'Outing / Activity', 'House meeting', 'Other',
];

export const TZ = 'America/Vancouver';

// Today's date in Vancouver as YYYY-MM-DD
export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function age(dob) {
  if (!dob) return null;
  const today = todayISO();
  let a = Number(today.slice(0, 4)) - Number(dob.slice(0, 4));
  if (today.slice(5) < dob.slice(5)) a--;
  return a;
}

export function daysUntil(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso) - new Date(todayISO())) / 86400000);
}

// Add days to a YYYY-MM-DD date.
export function addDaysISO(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Monday of the week that contains this date.
export function weekStart(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const back = (d.getUTCDay() + 6) % 7;
  return addDaysISO(iso, -back);
}

// Current time in Vancouver as HH:MM
export function nowTime() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Two-week pay periods. Change PAY_PERIOD_ANCHOR to the first day of any real pay period.
export const PAY_PERIOD_ANCHOR = '2026-01-05'; // a Monday
export function payPeriod(iso) {
  const days = Math.round((new Date(iso + 'T12:00:00Z') - new Date(PAY_PERIOD_ANCHOR + 'T12:00:00Z')) / 86400000);
  const start = addDaysISO(PAY_PERIOD_ANCHOR, Math.floor(days / 14) * 14);
  return { start, end: addDaysISO(start, 13) };
}

export const SHIFT_LABELS = ['Day', 'Evening', 'Awake night', 'Sleep night', 'On-call', 'Other'];
export const DOC_CATEGORIES = [
  'Care plan (ICP / ISP)', 'Behaviour support plan', 'Medical / prescriptions', 'Assessments',
  'Legal / court / consent', 'Referral & intake', 'School / day program', 'Cultural plan',
  'Incident reports', 'Photos / ID', 'Inspection / licensing', 'Other',
];
export const GOAL_DOMAINS = ['Health', 'Daily living', 'Social & relationships', 'Education / work', 'Culture & identity', 'Behaviour', 'Independence', 'Recreation'];
export const MED_ROUTES = ['Oral', 'Topical', 'Inhaled', 'Eye drops', 'Ear drops', 'Injection', 'Patch', 'Rectal', 'Other'];

// Length of a shift in hours (handles overnight shifts).
export function shiftHours(s) {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let mins = toMin(s.end_time) - toMin(s.start_time);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}
