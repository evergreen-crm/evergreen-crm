// 📅 My next 6 months of shifts as a calendar file (.ics) — open it on a phone to add the shifts.
import { getCurrentUser } from '@/lib/auth';
import { addDaysISO, todayISO } from '@/lib/options';
import { shiftTimes } from '@/lib/attendance';

export const dynamic = 'force-dynamic';
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s) => String(s ?? '').replace(/[\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');

export async function GET() {
  const { supabase, profile } = await getCurrentUser();
  if (!profile) return new Response('Please sign in.', { status: 401 });
  const today = todayISO();
  const { data } = await supabase.from('shifts').select('id, shift_date, start_time, end_time, label, homes(name)')
    .eq('profile_id', profile.id).gte('shift_date', today).lte('shift_date', addDaysISO(today, 183)).order('shift_date');
  const now = stamp(new Date());
  const ev = (data ?? []).map((s) => {
    const { start, end } = shiftTimes(s);
    return ['BEGIN:VEVENT', `UID:evergreen-shift-${s.id}@evergreen-crm`, `DTSTAMP:${now}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(`Evergreen: ${s.label ?? 'Shift'}${s.homes?.name ? ' · ' + s.homes.name : ''}`)}`,
      `DESCRIPTION:${esc('Your Evergreen shift. Changes? Check the Schedule page in the CRM.')}`, 'END:VEVENT'].join('\r\n');
  });
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Evergreen Community Care//CRM//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Evergreen shifts', ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="evergreen-shifts.ics"', 'Cache-Control': 'no-store' } });
}
