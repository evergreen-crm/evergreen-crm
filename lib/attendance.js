// Attendance helpers: when a shift really starts and ends, and plain-word statuses.
// Rules live in supabase/attendance.sql (15 min early, late after 5 min, alerts at 15 / 30 min).
//
// B.C. time: B.C. moved to permanent daylight time in 2026 — UTC−7 all year (clocks did not fall back on
// Nov 1, 2026). The database uses the same fixed offset (evg_tz() in supabase/attendance.sql), so the screens
// and the alerts always agree, whatever time-zone data the server has.
export const BC_TZ = 'Etc/GMT+7'; // means UTC−7 (the sign is reversed in these names)
const OFFSET = '-07:00';

// A B.C. wall-clock date + time → the real instant.
export function vanTime(dateIso, time) {
  const t = String(time ?? '00:00').slice(0, 5);
  return new Date(`${dateIso}T${t}:00${OFFSET}`);
}

export function shiftTimes(s) {
  const start = vanTime(s.shift_date, s.start_time);
  let end = vanTime(s.shift_date, s.end_time);
  if (end <= start) end = new Date(end.getTime() + 24 * 3600000);
  return { start, end };
}

export const hoursUntil = (d) => (d.getTime() - Date.now()) / 3600000;
export const clock = (d) => d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: BC_TZ });

export const ABSENCE_KINDS = ['Sick', 'Family emergency', 'Other'];
export const ABSENCE_TONE = { 'Called in': 'warn', 'Running late': 'warn', 'Possible no-show': 'bad', 'No-show': 'bad', Excused: '', 'Late arrival': 'warn' };
// BC Employment Standards Act: after 90 days of employment, 5 paid sick days a year (plus 3 unpaid).
export const PAID_SICK_DAYS = 5;
