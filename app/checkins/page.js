// Managers: who is on shift now, when they last checked in, and every check-in for a day with location.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { fmtDate, fmtDateTime, todayISO, addDaysISO, TZ } from '@/lib/options';
import { fmtDistance, CHECKIN_EVERY_HOURS } from '@/lib/idcard';

const localDate = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts));
const time = (ts) => fmtDateTime(ts).split(', ').pop();

function Where({ c }) {
  if (c.lat == null) return <span className="badge warn">No location shared</span>;
  const map = <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer" className="small">map</a>;
  if (c.on_site) return <><span className="badge">At house</span> {map}</>;
  if (c.on_site === false) return <><span className="badge bad">{fmtDistance(c.distance_m)} away</span> {map}</>;
  return <><span className="muted small">House location not set</span> {map}</>;
}

export default async function CheckinsPage({ searchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireUser(['admin', 'manager']);
  const day = sp.d ?? todayISO();

  const [{ data: open }, { data: raw }, { data: homesNoLoc }] = await Promise.all([
    supabase.from('time_entries').select('id, clock_in, person:profile_id(id, full_name), homes(name)').is('clock_out', null).order('clock_in'),
    supabase.from('location_checkins').select('*, person:profile_id(id, full_name), homes(name)')
      .gte('at', addDaysISO(day, -1)).lte('at', addDaysISO(day, 2)).order('at', { ascending: false }),
    supabase.from('homes').select('id, name').is('lat', null).order('name'),
  ]);
  const rows = (raw ?? []).filter((c) => localDate(c.at) === day);
  const lastFor = {};
  for (const c of raw ?? []) if (c.time_entry_id && !lastFor[c.time_entry_id]) lastFor[c.time_entry_id] = c;

  const now = Date.now();
  const shifts = (open ?? []).map((e) => {
    const last = lastFor[e.id];
    const lastAt = last?.at ?? e.clock_in;
    const hrs = (now - new Date(lastAt).getTime()) / 3600000;
    return { ...e, last, lastAt, hrs, overdue: hrs >= CHECKIN_EVERY_HOURS };
  });
  const away = rows.filter((c) => c.on_site === false).length;
  const noLoc = rows.filter((c) => c.lat == null).length;

  return (
    <main>
      <div className="title-row">
        <h1>Check-ins</h1>
        <span className="small no-print">
          <Link href={`/checkins?d=${addDaysISO(day, -1)}`}>← Previous day</Link>{' · '}
          <Link href="/checkins">Today</Link>{' · '}
          <Link href={`/checkins?d=${addDaysISO(day, 1)}`}>Next →</Link>
        </span>
      </div>
      <p className="muted">Staff check in from their ID card every {CHECKIN_EVERY_HOURS} hours while on shift. Location is taken only when they tap the button.</p>
      {homesNoLoc?.length > 0 && (
        <p className="message small">No location set for: {homesNoLoc.map((h, i) => <span key={h.id}>{i > 0 && ', '}<Link href={`/homes/${h.id}?edit=1`}>{h.name}</Link></span>)}. Set it so check-ins can show “At house”.</p>
      )}

      <div className="stats">
        <div className="stat"><strong>{shifts.length}</strong><span>on shift now</span></div>
        <div className={`stat ${shifts.some((s) => s.overdue) ? 'warn' : ''}`}><strong>{shifts.filter((s) => s.overdue).length}</strong><span>check-in overdue</span></div>
        <div className={`stat ${away ? 'warn' : ''}`}><strong>{away}</strong><span>away from house · {fmtDate(day)}</span></div>
        <div className="stat"><strong>{noLoc}</strong><span>no location shared</span></div>
      </div>

      <h2>On shift now</h2>
      {shifts.length === 0 ? <p className="muted">Nobody is clocked in.</p> : (
        <table>
          <thead><tr><th>Staff</th><th>House</th><th>Since</th><th>Last check-in</th><th>Where</th></tr></thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/hr/${s.person?.id}`}>{s.person?.full_name}</Link></td>
                <td>{s.homes?.name ?? '—'}</td>
                <td>{fmtDateTime(s.clock_in)}</td>
                <td>{time(s.lastAt)} <span className={s.overdue ? 'badge bad' : 'muted small'}>{s.hrs < 1 ? `${Math.round(s.hrs * 60)} min ago` : `${s.hrs.toFixed(1)} h ago`}</span></td>
                <td>{s.last ? <Where c={s.last} /> : <span className="muted small">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>All check-ins · {fmtDate(day)}</h2>
      {rows.length === 0 ? <p className="muted">No check-ins on this day.</p> : (
        <table>
          <thead><tr><th>Time</th><th>Staff</th><th>Type</th><th>House</th><th>Where</th><th>Accuracy</th><th>Note</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{time(c.at)}</td>
                <td>{c.person?.full_name}</td>
                <td>{c.kind}</td>
                <td>{c.homes?.name ?? '—'}</td>
                <td><Where c={c} /></td>
                <td className="small">{c.accuracy_m != null ? `± ${c.accuracy_m} m` : '—'}</td>
                <td className="small">{c.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
