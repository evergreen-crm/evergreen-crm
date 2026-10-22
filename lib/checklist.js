// Shift duty checklists and quick daily notes: shared labels and helpers (supabase/shift-checklists.sql).
import { TZ, todayISO, addDaysISO } from '@/lib/options';

export const SHIFTS = {
  Day: { icon: '☀️', label: 'Day' },
  Evening: { icon: '🌆', label: 'Evening' },
  Night: { icon: '🌙', label: 'Night (awake)' },
};
export const SECTIONS = [
  { key: 'Start', label: 'Start of shift', hint: 'First 15 minutes' },
  { key: 'Shift', label: 'During the shift', hint: '' },
  { key: 'End', label: 'End of shift', hint: 'Last 30 minutes' },
];
export const AREAS = {
  Safety: '🛡', Care: '🤝', Medication: '💊', Cleaning: '🧽', Records: '📝', House: '🏠',
};
export const DEFAULT_TIMES = { day: '07:00', evening: '15:00', night: '23:00' };

const toMin = (t) => { const [h, m] = String(t ?? '00:00').split(':').map(Number); return h * 60 + (m || 0); };
const fmt12 = (t) => { const m = toMin(t); const h = Math.floor(m / 60); return `${((h + 11) % 12) + 1}${m % 60 ? ':' + String(m % 60).padStart(2, '0') : ''} ${h >= 12 ? 'pm' : 'am'}`; };

export function houseTimes(home) {
  return {
    day: (home?.shift_day_start ?? DEFAULT_TIMES.day).slice(0, 5),
    evening: (home?.shift_evening_start ?? DEFAULT_TIMES.evening).slice(0, 5),
    night: (home?.shift_night_start ?? DEFAULT_TIMES.night).slice(0, 5),
  };
}
export function shiftHours(home) {
  const t = houseTimes(home);
  return { Day: `${fmt12(t.day)}–${fmt12(t.evening)}`, Evening: `${fmt12(t.evening)}–${fmt12(t.night)}`, Night: `${fmt12(t.night)}–${fmt12(t.day)}` };
}

// The shift happening now at a house (Vancouver time). The working day starts at the Day shift, so a Night shift
// that starts at or after midnight (e.g. 12-8) still belongs to the day before.
export function shiftNow(home, now = new Date()) {
  const t = houseTimes(home);
  const hm = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const day = toMin(t.day);
  const rel = (x) => (toMin(x) - day + 1440) % 1440;
  const r = (toMin(hm) - day + 1440) % 1440;
  const today = todayISO();
  const date = toMin(hm) < day ? addDaysISO(today, -1) : today;
  if (r < rel(t.evening)) return { shift: 'Day', date };
  if (r < rel(t.night)) return { shift: 'Evening', date };
  return { shift: 'Night', date };
}
export const timesInOrder = (d, e, n) => { const day = toMin(d); const rel = (x) => (toMin(x) - day + 1440) % 1440; return rel(e) > 0 && rel(n) > rel(e); };

export const expectedBedChecks = (minutes = 30, hours = 8) => Math.floor((hours * 60) / Math.max(10, minutes));

// Quick daily notes: tap choices.
export const MOODS = [
  { v: 'Happy', icon: '😊' }, { v: 'Calm', icon: '😌' }, { v: 'Anxious', icon: '😟' }, { v: 'Upset', icon: '😠' }, { v: 'Withdrawn', icon: '😶' },
];
export const MEALS = ['Ate all', 'Ate some', 'Refused'];
export const ACTIVITIES = ['School', 'Work / day program', 'Outing', 'Program', 'Chores', 'Family visit', 'Appointment', 'Culture', 'Sports', 'Rest'];
export const NOTE_PROMPTS = 'How was their day:\n\nAny concerns (health, mood, safety, behaviour):\n\nFollow-up for the next shift:\n';

// Have I written and signed a note this shift for every person at the house?
export async function notesForShift(supabase, { homeId, userId, since }) {
  const [{ data: people }, { data: notes }] = await Promise.all([
    supabase.from('residents').select('id, first_name, preferred_name').eq('home_id', homeId).neq('status', 'discharged'),
    supabase.from('shift_notes').select('resident_id, signed_at').eq('author_id', userId).gte('created_at', since),
  ]);
  const signed = new Set((notes ?? []).filter((n) => n.signed_at).map((n) => n.resident_id));
  const missing = (people ?? []).filter((p) => !signed.has(p.id)).map((p) => p.preferred_name || p.first_name);
  return { total: (people ?? []).length, done: (people ?? []).length - missing.length, missing };
}
