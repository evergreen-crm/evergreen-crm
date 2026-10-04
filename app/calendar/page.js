// Calendar: month view of appointments, by house. Click a day to see/add.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { APPT_CATEGORIES, fmtDate, fmtTime, todayISO } from '@/lib/options';
import { addAppointment, setAppointmentStatus } from '@/app/calendar/actions';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');

export default async function CalendarPage({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);

  const today = todayISO();
  const selected = sp.d ?? today;
  const month = sp.m ?? selected.slice(0, 7);         // YYYY-MM
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${month}-${pad(daysInMonth)}`;
  const startWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sunday

  const { data: homes } = await supabase.from('homes').select('id, name').order('name');
  const homeId = sp.home ?? (profile.role === 'staff' ? profile.home_id : '');

  let q = supabase.from('appointments')
    .select('id, title, category, appt_date, start_time, end_time, location, notes, status, home_id, homes(name), residents(id, first_name, last_name)')
    .gte('appt_date', first).lte('appt_date', last)
    .order('appt_date').order('start_time');
  if (homeId) q = q.eq('home_id', homeId);
  const { data: appts } = await q;

  let rq = supabase.from('residents').select('id, first_name, last_name, home_id').neq('status', 'discharged').order('last_name');
  if (homeId) rq = rq.eq('home_id', homeId);
  const { data: residents } = await rq;

  const byDay = {};
  for (const a of appts ?? []) (byDay[a.appt_date] ??= []).push(a);

  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  const link = (extra) => {
    const p = new URLSearchParams({ ...(homeId && { home: homeId }), m: month, ...extra });
    return `/calendar?${p}`;
  };

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${pad(d)}`);

  const dayList = byDay[selected] ?? [];

  return (
    <main>
      <div className="title-row no-print">
        <h1>Calendar</h1>
        <form className="row" action="/calendar">
          <select name="home" defaultValue={homeId}>
            {profile.role !== 'staff' && <option value="">All houses</option>}
            {homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <input type="hidden" name="m" value={month} />
          <button className="secondary">Show</button>
        </form>
      </div>

      <div className="title-row">
        <Link className="button secondary no-print" href={link({ m: prev })}>←</Link>
        <h2>{MONTHS[m - 1]} {y}{homeId && homes ? ` · ${homes.find((h) => h.id === homeId)?.name ?? ''}` : ''}</h2>
        <Link className="button secondary no-print" href={link({ m: next })}>→</Link>
      </div>

      <div className="calendar">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="dow">{d}</div>)}
        {cells.map((date, i) => date === null ? <div key={`e${i}`} className="day empty" /> : (
          <Link key={date} href={link({ d: date })}
            className={`day ${date === today ? 'today' : ''} ${date === selected ? 'selected' : ''}`}>
            <span className="num">{Number(date.slice(8))}</span>
            {(byDay[date] ?? []).slice(0, 3).map((a) => (
              <span key={a.id} className={`chip ${a.status === 'Cancelled' ? 'cancelled' : ''}`}>
                {a.start_time ? fmtTime(a.start_time) + ' ' : ''}{a.title}
              </span>
            ))}
            {(byDay[date]?.length ?? 0) > 3 && <span className="muted small">+{byDay[date].length - 3} more</span>}
          </Link>
        ))}
      </div>

      <h2>{fmtDate(selected)}</h2>
      {dayList.length === 0 && <p className="muted">Nothing scheduled this day.</p>}
      <ul className="agenda">
        {dayList.map((a) => (
          <li key={a.id} className={a.status === 'Cancelled' ? 'cancelled' : ''}>
            <span className="when">{a.start_time ? fmtTime(a.start_time) : 'All day'}{a.end_time && `–${fmtTime(a.end_time)}`}</span>
            <span>
              <strong>{a.title}</strong> <span className="badge">{a.category}</span>{' '}
              {a.status !== 'Scheduled' && <span className="badge warn">{a.status}</span>}
              <div className="muted small">
                {a.residents ? <Link href={`/residents/${a.residents.id}`}>{a.residents.first_name} {a.residents.last_name}</Link> : 'Whole house'}
                {!homeId && ` · ${a.homes?.name}`}{a.location && ` · ${a.location}`}
              </div>
              {a.notes && <div className="small">{a.notes}</div>}
              {a.status === 'Scheduled' && (
                <span className="row no-print">
                  <form action={setAppointmentStatus}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="Done" /><button className="link small">Mark done</button></form>
                  <form action={setAppointmentStatus}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="Cancelled" /><button className="link small">Cancel</button></form>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <form action={addAppointment} className="card no-print">
        <h3>Add to calendar</h3>
        <input type="hidden" name="back" value={link({ d: selected })} />
        <label>What<input name="title" required placeholder="e.g., Dentist check-up" /></label>
        <div className="row">
          <label>
            Type
            <select name="category" defaultValue="Medical">
              {APPT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Date<input type="date" name="appt_date" required defaultValue={selected} /></label>
          <label>Start<input type="time" name="start_time" /></label>
          <label>End<input type="time" name="end_time" /></label>
        </div>
        <div className="row">
          <label>
            House
            <select name="home_id" required defaultValue={homeId || ''}>
              <option value="" disabled>Pick a house</option>
              {homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <label>
            Resident
            <select name="resident_id" defaultValue={sp.resident ?? ''}>
              <option value="">Whole house</option>
              {residents?.map((r) => <option key={r.id} value={r.id}>{r.first_name} {r.last_name}</option>)}
            </select>
          </label>
          <label>Location<input name="location" /></label>
        </div>
        <label>Notes<input name="notes" /></label>
        <label className="check"><input type="checkbox" name="share_with_family" /> Show to family in portal</label>
        <button>Add</button>
      </form>
    </main>
  );
}
