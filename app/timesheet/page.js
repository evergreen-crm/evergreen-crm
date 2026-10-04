// Timesheets: clock in / out, two-week pay periods, manager approval.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { payPeriod, addDaysISO, todayISO, fmtDate, fmtDateTime, TZ } from '@/lib/options';
import { clockIn, clockOut, addTime, approveTime, deleteTime } from '@/app/timesheet/actions';

const hours = (e) => !e.clock_out ? 0 : Math.max(0, (new Date(e.clock_out) - new Date(e.clock_in)) / 3600000 - (e.break_minutes ?? 0) / 60);
const localDate = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts));

export default async function TimesheetPage({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isMgr = ['admin', 'manager'].includes(profile.role);
  const today = todayISO();
  const period = payPeriod(sp.p ?? today);
  const who = isMgr ? (sp.staff ?? '') : user.id;

  const [{ data: homes }, { data: people }, { data: openEntry }] = await Promise.all([
    supabase.from('homes').select('id, name').order('name'),
    isMgr ? supabase.from('profiles').select('id, full_name').in('role', ['staff', 'manager']).order('full_name') : { data: [] },
    supabase.from('time_entries').select('*').eq('profile_id', user.id).is('clock_out', null).maybeSingle(),
  ]);

  // A day before / after the period so overnight shifts are included, then filter by local date.
  let q = supabase.from('time_entries').select('*, person:profile_id(full_name), homes(name)')
    .gte('clock_in', addDaysISO(period.start, -1)).lte('clock_in', addDaysISO(period.end, 2));
  if (who) q = q.eq('profile_id', who);
  const { data: raw } = await q.order('clock_in', { ascending: false });
  const rows = (raw ?? []).filter((e) => { const d = localDate(e.clock_in); return d >= period.start && d <= period.end; });

  const totals = {};
  for (const e of rows) { const k = e.person?.full_name ?? 'Me'; totals[k] = (totals[k] ?? 0) + hours(e); }
  const pending = rows.filter((e) => e.clock_out && !e.approved_at).length;
  const qs = (o) => '/timesheet?' + new URLSearchParams({ ...(who && isMgr && { staff: who }), p: period.start, ...o }).toString();

  return (
    <main>
      <div className="title-row">
        <h1>Timesheet</h1>
        <span className="small no-print">
          <Link href={qs({ p: addDaysISO(period.start, -14) })}>← Previous period</Link>{' · '}
          <Link href={qs({ p: today })}>Current</Link>{' · '}
          <Link href={qs({ p: addDaysISO(period.start, 14) })}>Next →</Link>
        </span>
      </div>
      <p className="muted">Pay period {fmtDate(period.start)} to {fmtDate(period.end)}</p>

      <div className="card no-print">
        {openEntry ? (
          <form action={clockOut}>
            <p><strong>You are clocked in</strong> since {fmtDateTime(openEntry.clock_in)}.</p>
            <input type="hidden" name="id" value={openEntry.id} />
            <div className="row">
              <label>Unpaid break (minutes)<input type="number" min="0" name="break_minutes" defaultValue="0" /></label>
              <label>Notes<input name="notes" /></label>
            </div>
            <button>Clock out</button>
          </form>
        ) : (
          <form action={clockIn} className="row">
            <label>House
              <select name="home_id" defaultValue={profile.home_id ?? ''}>
                <option value="">—</option>
                {homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </label>
            <label>Notes<input name="notes" placeholder="optional" /></label>
            <button>Clock in</button>
          </form>
        )}
      </div>

      {isMgr && (
        <form className="row no-print" action="/timesheet">
          <input type="hidden" name="p" value={period.start} />
          <label>Staff
            <select name="staff" defaultValue={who}>
              <option value="">Everyone</option>
              {people?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </label>
          <button className="secondary">Show</button>
        </form>
      )}

      <div className="stats">
        {Object.entries(totals).map(([k, h]) => (
          <div key={k} className="stat"><strong>{h.toFixed(2)}</strong><span>hours · {k}</span></div>
        ))}
        {isMgr && <div className={`stat ${pending ? 'warn' : ''}`}><strong>{pending}</strong><span>waiting for approval</span></div>}
      </div>

      {rows.length === 0 && <p className="muted">No time recorded in this period.</p>}
      {rows.length > 0 && (
        <form action={approveTime}>
          <table>
            <thead><tr>{isMgr && <th></th>}<th>Date</th>{isMgr && <th>Staff</th>}<th>In</th><th>Out</th><th>Break</th><th>Hours</th><th>Status</th>{isMgr && <th></th>}</tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  {isMgr && <td>{e.clock_out && !e.approved_at && <input type="checkbox" name="id" value={e.id} defaultChecked />}</td>}
                  <td>{fmtDate(localDate(e.clock_in))}<div className="muted small">{e.homes?.name}{e.notes && ` · ${e.notes}`}</div></td>
                  {isMgr && <td>{e.person?.full_name}</td>}
                  <td>{fmtDateTime(e.clock_in).split(', ').pop()}</td>
                  <td>{e.clock_out ? fmtDateTime(e.clock_out).split(', ').pop() : <span className="badge warn">On shift</span>}</td>
                  <td>{e.break_minutes ? `${e.break_minutes} min` : '—'}</td>
                  <td>{hours(e).toFixed(2)}</td>
                  <td>{e.approved_at ? <span className="badge">Approved</span> : e.clock_out ? <span className="badge warn">Pending</span> : ''}</td>
                  {isMgr && <td><button formAction={deleteTime} name="delete_id" value={e.id} className="link small">Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {isMgr && pending > 0 && <p className="no-print"><button>Approve ticked entries</button></p>}
        </form>
      )}

      <details className="card no-print">
        <summary><strong>+ Add a missed punch</strong></summary>
        <form action={addTime}>
          <div className="row">
            {isMgr && (
              <label>Staff
                <select name="profile_id" defaultValue={who || user.id}>
                  {people?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </label>
            )}
            <label>House
              <select name="home_id" defaultValue={profile.home_id ?? ''}>
                <option value="">—</option>
                {homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </label>
            <label>Date<input type="date" name="date" required defaultValue={today} /></label>
            <label>Start<input type="time" name="start" required /></label>
            <label>End<input type="time" name="end" required /></label>
            <label>Break (min)<input type="number" min="0" name="break_minutes" defaultValue="0" /></label>
          </div>
          <label>Reason<input name="notes" required placeholder="e.g., forgot to clock in" /></label>
          <button>Add</button>
        </form>
      </details>
    </main>
  );
}
