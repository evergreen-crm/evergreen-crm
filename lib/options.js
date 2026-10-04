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
