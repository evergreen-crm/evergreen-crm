// LAUNCH PLANS: MCFD SHSS Transition-In plans (Appendix E) and how ready each one is to open.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { fmtDate, daysUntil } from '@/lib/options';

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

function Bar({ value, label }) {
  const color = value >= 100 ? 'var(--green)' : value >= 60 ? 'var(--amber)' : 'var(--red)';
  return (
    <div className="small" style={{ margin: '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{label}</span><strong>{value}%</strong></div>
      <div style={{ height: 8, background: '#eef1ef', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: color }} />
      </div>
    </div>
  );
}

export default async function LaunchPlans({ searchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireUser(['admin', 'manager']);
  const [{ data: plans, error }, { data: ready }, { data: ms }, { data: due }] = await Promise.all([
    supabase.from('launch_plans').select('*').order('created_at'),
    supabase.from('launch_readiness').select('*'),
    supabase.from('launch_milestones').select('plan_id, completed_on'),
    supabase.from('launch_documents_due').select('plan_id, due_status').in('due_status', ['Overdue', 'Due this week']),
  ]);
  const r = Object.fromEntries((ready ?? []).map((x) => [x.plan_id, x]));
  const m = {};
  for (const x of ms ?? []) { const c = (m[x.plan_id] ??= { total: 0, done: 0 }); c.total++; if (x.completed_on) c.done++; }
  const late = {};
  for (const x of due ?? []) { const c = (late[x.plan_id] ??= { overdue: 0, week: 0 }); x.due_status === 'Overdue' ? c.overdue++ : c.week++; }

  return (
    <main>
      <h1>🚀 Launch plans</h1>
      <p className="muted">MCFD SHSS Transition-In plans (Appendix E): 12 milestones, the documents needed before opening, and readiness for each new program. A plan can’t be marked <strong>Complete</strong> until every MCFD-required and legal document is approved.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}
      {error && <p className="message">Launch plans aren’t set up yet. Run <code>supabase/launch-people.sql</code> in Supabase → SQL Editor.</p>}

      <div className="grid2">
        {(plans ?? []).map((p) => {
          const rd = r[p.id] ?? {}; const mm = m[p.id] ?? { total: 0, done: 0 }; const lt = late[p.id] ?? {};
          const d = daysUntil(p.opening_date);
          return (
            <Link key={p.id} href={`/launch/${p.id}`} className="card" style={{ display: 'block', color: 'inherit' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <h2 style={{ margin: 0 }}>{p.care_setting_name ?? 'Care setting TBD'}</h2>
                <span className={`badge${p.status === 'Complete' ? '' : ' warn'}`} style={{ alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>{p.status}</span>
              </div>
              <p className="muted small" style={{ margin: '4px 0 10px' }}>{p.service_type}</p>
              <p className="small" style={{ margin: '0 0 8px' }}>
                Opening: <strong>{p.opening_date ? fmtDate(p.opening_date) : 'not set'}</strong>
                {d !== null && <span className={d < 0 ? 'bad-text' : 'muted'}> · {d >= 0 ? `${d} days to go` : `${-d} days ago`}</span>}
              </p>
              <Bar value={pct(rd.required_done ?? 0, rd.required_total ?? 0)} label={`Required documents (${rd.required_done ?? 0} of ${rd.required_total ?? 0})`} />
              <Bar value={rd.pct_ready ?? 0} label={`All pre-opening documents (${rd.all_done ?? 0} of ${rd.all_total ?? 0})`} />
              <Bar value={pct(mm.done, mm.total)} label={`Milestones complete (${mm.done} of ${mm.total})`} />
              {(lt.overdue > 0 || lt.week > 0) && (
                <p className="small" style={{ margin: '8px 0 0' }}>
                  {lt.overdue > 0 && <span className="badge bad">{lt.overdue} overdue</span>} {lt.week > 0 && <span className="badge warn">{lt.week} due this week</span>}
                </p>
              )}
            </Link>
          );
        })}
      </div>
      {plans?.length === 0 && <p className="card muted">No launch plans yet.</p>}
    </main>
  );
}
