// Shift schedule: one week at a time, by house.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { SHIFT_LABELS, shiftHours, addDaysISO, weekStart, todayISO, fmtDate, fmtTime } from '@/lib/options';
import { addShift, deleteShift, copyLastWeek } from '@/app/schedule/actions';

export default async function SchedulePage({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const canEdit = ['admin', 'manager'].includes(profile.role);
  const today = todayISO();
  const week = weekStart(sp.w ?? today);
  const end = addDaysISO(week, 6);
  const homeId = sp.home ?? (profile.role === 'staff' ? profile.home_id ?? '' : '');
  const mine = sp.mine === '1';

  const [{ data: homes }, { data: people }] = await Promise.all([
    supabase.from('homes').select('id, name').order('name'),
    supabase.from('profiles').select('id, full_name, role, home_id').in('role', ['staff', 'manager']).eq('active', true).order('full_name'),
  ]);
  let q = supabase.from('shifts').select('*, homes(name), profiles:profile_id(full_name)').gte('shift_date', week).lte('shift_date', end);
  if (homeId) q = q.eq('home_id', homeId);
  if (mine) q = q.eq('profile_id', profile.id);
  const { data: shifts } = await q.order('shift_date').order('start_time');

  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(week, i));
  const qs = (o) => '/schedule?' + new URLSearchParams({ ...(homeId && { home: homeId }), ...(mine && { mine: '1' }), w: week, ...o }).toString();

  // Hours per person this week
  const totals = {};
  for (const s of shifts ?? []) {
    const k = s.profiles?.full_name ?? 'Open shift';
    totals[k] = (totals[k] ?? 0) + shiftHours(s);
  }
  const open = (shifts ?? []).filter((s) => !s.profile_id).length;

  return (
    <main>
      <div className="title-row">
        <h1>Schedule</h1>
        <span className="small no-print">
          <Link href={qs({ w: addDaysISO(week, -7) })}>← Last week</Link>{' · '}
          <Link href={qs({ w: weekStart(today) })}>This week</Link>{' · '}
          <Link href={qs({ w: addDaysISO(week, 7) })}>Next week →</Link>
        </span>
      </div>
      <p className="muted">Week of {fmtDate(week)} to {fmtDate(end)}</p>

      <form className="row no-print" action="/schedule">
        <input type="hidden" name="w" value={week} />
        <label>House
          <select name="home" defaultValue={homeId}>
            <option value="">All houses</option>
            {homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" name="mine" value="1" defaultChecked={mine} /> Only my shifts</label>
        <button className="secondary">Show</button>
      </form>

      {open > 0 && <p className="alert">{open} open shift{open === 1 ? '' : 's'} with no one assigned this week.</p>}

      <div className="week">
        {days.map((d) => {
          const list = (shifts ?? []).filter((s) => s.shift_date === d);
          return (
            <div key={d} className={`weekday ${d === today ? 'today' : ''}`}>
              <div className="num">{fmtDate(d).split(',')[0]} {d.slice(8)}</div>
              {list.length === 0 && <span className="muted small">—</span>}
              {list.map((s) => (
                <div key={s.id} className={`shift ${!s.profile_id ? 'open' : ''} ${s.profile_id === profile.id ? 'me' : ''}`}>
                  <strong>{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</strong>
                  <span>{s.profiles?.full_name ?? 'OPEN'}</span>
                  <span className="muted small">{[s.label, !homeId && s.homes?.name].filter(Boolean).join(' · ')}</span>
                  {s.notes && <span className="small">{s.notes}</span>}
                  {canEdit && (
                    <form action={deleteShift} className="no-print">
                      <input type="hidden" name="id" value={s.id} />
                      <button className="link small">Remove</button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {Object.keys(totals).length > 0 && (
        <>
          <h2>Hours this week</h2>
          <table>
            <thead><tr><th>Staff</th><th>Scheduled hours</th></tr></thead>
            <tbody>{Object.entries(totals).sort().map(([k, h]) => <tr key={k}><td>{k}</td><td>{h.toFixed(1)}</td></tr>)}</tbody>
          </table>
        </>
      )}

      {canEdit && (
        <>
          <form action={addShift} className="card no-print">
            <h3>Add a shift</h3>
            <div className="row">
              <label>House
                <select name="home_id" required defaultValue={homeId}>
                  <option value="" disabled>Choose…</option>
                  {homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </label>
              <label>Staff
                <select name="profile_id" defaultValue="">
                  <option value="">Open shift (no one yet)</option>
                  {people?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </label>
              <label>Shift<select name="label" defaultValue="Day">{SHIFT_LABELS.map((l) => <option key={l}>{l}</option>)}</select></label>
            </div>
            <div className="row">
              <label>Date<input type="date" name="shift_date" required defaultValue={week < today && end >= today ? today : week} /></label>
              <label>Start<input type="time" name="start_time" required defaultValue="07:00" /></label>
              <label>End<input type="time" name="end_time" required defaultValue="15:00" /></label>
              <label>Repeat for<select name="repeat" defaultValue="1">{[1, 2, 3, 4, 5, 6, 7, 14].map((n) => <option key={n} value={n}>{n} day{n > 1 ? 's' : ''}</option>)}</select></label>
            </div>
            <label>Notes<input name="notes" placeholder="e.g., drive to appointment at 10" /></label>
            <button>Add shift</button>
          </form>
          {homeId && (
            <form action={copyLastWeek} className="no-print">
              <input type="hidden" name="home_id" value={homeId} />
              <input type="hidden" name="week" value={week} />
              <button className="secondary">Copy last week's shifts into this week</button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
