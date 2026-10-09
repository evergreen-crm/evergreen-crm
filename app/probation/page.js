// PROBATION: 30 / 90 / 120-day reviews for new hires, then confirmation to full-time.
// Program Coordinators see their house; Program Managers, HR and above see everyone; staff see their own.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf, canHR } from '@/lib/levels';
import { fmtDate, todayISO } from '@/lib/options';
import { startProbation } from './actions';

const VIEWS = [
  { key: 'due', label: 'Reviews to do' },
  { key: 'staff', label: 'Staff on probation' },
  { key: 'done', label: 'Completed reviews' },
];
const STATUS_BADGE = { Overdue: 'badge bad', 'Due this week': 'badge warn', Upcoming: 'badge', Done: 'badge' };

export default async function Probation({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  const manager = lvl >= 2 || canHR(profile);
  const view = VIEWS.some((v) => v.key === sp.view) ? sp.view : manager ? 'due' : 'done';
  const today = todayISO();

  const [{ data: rows, error }, { data: onProb }, { data: people }, { data: homes }, { data: details }] = await Promise.all([
    supabase.from('probation_due_list').select('*').order('due_date'),
    supabase.from('staff_probation').select('*'),
    manager ? supabase.from('profiles').select('id, full_name, home_id, role, active').neq('role', 'family').eq('active', true).order('full_name') : Promise.resolve({ data: [] }),
    supabase.from('homes').select('id, name'),
    manager ? supabase.from('staff_details').select('profile_id, hire_date, position') : Promise.resolve({ data: [] }),
  ]);
  const hName = Object.fromEntries((homes ?? []).map((h) => [h.id, h.name]));
  const pName = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]));
  const det = Object.fromEntries((details ?? []).map((d) => [d.profile_id, d]));
  const all = rows ?? [];
  const todo = all.filter((r) => r.review_status !== 'Done' && ['On probation', 'Extended'].includes(r.probation_status));
  const done = all.filter((r) => r.review_status === 'Done').sort((a, b) => (b.completed_on ?? '').localeCompare(a.completed_on ?? ''));
  const onList = new Set((onProb ?? []).map((p) => p.staff_id));
  const canAdd = (people ?? []).filter((p) => !onList.has(p.id) && p.id !== user.id && (lvl >= 3 || canHR(profile) || p.home_id === profile.home_id));
  const nameOf = (id) => pName[id] ?? all.find((r) => r.staff_id === id)?.staff_name ?? '—';

  const stat = {
    overdue: todo.filter((r) => r.review_status === 'Overdue').length,
    week: todo.filter((r) => r.review_status === 'Due this week').length,
    onProbation: (onProb ?? []).filter((p) => ['On probation', 'Extended'].includes(p.status)).length,
    confirmed: (onProb ?? []).filter((p) => p.status === 'Confirmed full-time' && p.confirmed_on && p.confirmed_on >= today.slice(0, 4) + '-01-01').length,
  };

  return (
    <main>
      <h1>📝 Probation reviews</h1>
      <p className="muted">Every new hire has a <strong>30-day</strong> and <strong>90-day</strong> review (Program Coordinator) and a final <strong>120-day</strong> review (Program Manager or above) that decides: <em>confirm full-time</em>, <em>extend 30 days</em>, or <em>end employment</em>.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}
      {error && <p className="message">Probation isn’t set up yet. Run <code>supabase/launch-people.sql</code> in Supabase → SQL Editor.</p>}

      {manager && (
        <div className="stats">
          <div className={`stat ${stat.overdue ? 'bad' : ''}`}><strong>{stat.overdue}</strong><span>reviews overdue</span></div>
          <div className={`stat ${stat.week ? 'warn' : ''}`}><strong>{stat.week}</strong><span>due this week</span></div>
          <div className="stat"><strong>{stat.onProbation}</strong><span>staff on probation</span></div>
          <div className="stat"><strong>{stat.confirmed}</strong><span>confirmed full-time this year</span></div>
        </div>
      )}

      <nav className="tabs-bar">
        {VIEWS.filter((v) => manager || v.key !== 'staff').map((v) => (
          <Link key={v.key} href={`/probation?view=${v.key}`} className={view === v.key ? 'on' : ''}>
            {manager || v.key === 'done' ? v.label : 'My reviews'}{v.key === 'due' && todo.length ? ` (${todo.length})` : ''}
          </Link>
        ))}
      </nav>

      {view === 'due' && (todo.length === 0 ? <p className="card muted">No reviews waiting. 🎉</p> : (
        <table>
          <thead><tr><th>Staff</th><th>House</th><th>Review</th><th>Due</th><th>Status</th><th>Done by</th></tr></thead>
          <tbody>{todo.map((r) => (
            <tr key={r.review_id}>
              <td><Link href={`/probation/${r.review_id}`}>{r.staff_name}</Link>{r.position && <div className="muted small">{r.position}</div>}</td>
              <td className="small">{hName[r.home_id] ?? '—'}</td>
              <td>{r.review}{r.probation_status === 'Extended' && <span className="badge warn"> extended</span>}</td>
              <td className={r.review_status === 'Overdue' ? 'bad-text' : ''}>{fmtDate(r.due_date)}</td>
              <td><span className={STATUS_BADGE[r.review_status]}>{r.review_status}</span></td>
              <td className="small">{r.completed_by}</td>
            </tr>))}
          </tbody>
        </table>
      ))}

      {view === 'staff' && manager && (
        <>
          <table>
            <thead><tr><th>Staff</th><th>Position</th><th>Hire date</th><th>Status</th><th>Confirmed</th></tr></thead>
            <tbody>{(onProb ?? []).sort((a, b) => b.hire_date.localeCompare(a.hire_date)).map((p) => (
              <tr key={p.staff_id}>
                <td><Link href={`/hr/${p.staff_id}`}>{nameOf(p.staff_id)}</Link></td>
                <td className="small">{p.position ?? '—'}</td>
                <td>{fmtDate(p.hire_date)}</td>
                <td><span className={p.status === 'Confirmed full-time' ? 'badge' : p.status === 'Ended' ? 'badge bad' : 'badge warn'}>{p.status}</span></td>
                <td className="small">{p.confirmed_on ? fmtDate(p.confirmed_on) : '—'}</td>
              </tr>))}
            </tbody>
          </table>
          <form action={startProbation} className="card no-print" style={{ marginTop: 16 }}>
            <h2>+ Add a new hire</h2>
            <p className="muted small">The three reviews are booked automatically from the hire date. {lvl < 3 && !canHR(profile) ? 'You can add staff from your own house.' : ''}</p>
            <div className="row">
              <label>Staff member<select name="staff_id" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {canAdd.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.home_id ? ` — ${hName[p.home_id] ?? ''}` : ''}{det[p.id]?.hire_date ? ` (hired ${det[p.id].hire_date})` : ''}</option>)}
              </select></label>
              <label>Hire date<input type="date" name="hire_date" required defaultValue={today} /></label>
              <label>Position<input name="position" placeholder="e.g. Support Worker I" /></label>
            </div>
            <button>Add and book reviews</button>
          </form>
        </>
      )}

      {view === 'done' && (done.length === 0 ? <p className="card muted">No completed reviews yet.</p> : (
        <table>
          <thead><tr><th>Staff</th><th>Review</th><th>Completed</th><th>Rating</th><th>Decision</th></tr></thead>
          <tbody>{done.map((r) => (
            <tr key={r.review_id}>
              <td><Link href={`/probation/${r.review_id}`}>{r.staff_name}</Link></td>
              <td>{r.review}</td>
              <td>{fmtDate(r.completed_on)}</td>
              <td className="small">{r.rating}</td>
              <td className="small">{r.final_decision ?? '—'}</td>
            </tr>))}
          </tbody>
        </table>
      ))}
    </main>
  );
}
