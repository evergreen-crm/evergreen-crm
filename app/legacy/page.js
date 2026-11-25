// SHSS legacy agreement transition-in plans: one per legacy agreement, with its 30-day, 60-day, 90-day and 12-month obligations.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDate, daysUntil } from '@/lib/options';
import { createLegacyPlan } from './actions';
import Abbr from '@/app/components/Abbr';
import NotReady from '@/app/components/NotReady';
import { plainError } from '@/lib/plain';

const SERVICE_TYPES = ['Specialized Long-Term Care', 'Low-Barrier Short-Term Stabilization Care', 'Respite Care', 'Emergency Care'];

export default async function LegacyPlans({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const [{ data: plans, error }, { data: obs }] = await Promise.all([
    supabase.from('legacy_plans').select('*').order('created_at'),
    supabase.from('legacy_obligations').select('plan_id, status'),
  ]);
  const counts = {};
  for (const o of obs ?? []) { const c = (counts[o.plan_id] ??= { total: 0, done: 0 }); c.total++; if (o.status === 'Achieved') c.done++; }

  return (
    <main>
      <h1>📜 Legacy agreement transition-in</h1>
      <p className="muted">The <Abbr t="SHSS" /> Legacy Agreement Transition-In Plan &amp; Milestone Tracker, for agreements with an initial 12-month term: the 30-day, 60-day, 90-day and 12-month obligations, with the action plan for each item still In Progress.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{plainError(sp.error)}</p>}
      {error && <NotReady what="Legacy agreement transition-in" file="legacy-transition.sql" card={false} />}

      <div className="grid2">
        {(plans ?? []).map((p) => {
          const c = counts[p.id] ?? { total: 0, done: 0 };
          const pct = c.total ? Math.round((100 * c.done) / c.total) : 0;
          const d = p.term_end_date ? daysUntil(p.term_end_date) : null;
          return (
            <Link key={p.id} href={`/legacy/${p.id}`} className="card" style={{ display: 'block', color: 'inherit' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <h2 style={{ margin: 0 }}>{p.care_setting_name ?? 'Care setting TBD'}</h2>
                <span className={`badge${p.status === 'Term complete' || p.status === 'Signed' ? '' : ' warn'}`} style={{ alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>{p.status}</span>
              </div>
              <p className="muted small" style={{ margin: '4px 0 10px' }}>{p.shss_service_type ?? 'Service type TBD'}{p.agreement_number ? ` · Agreement ${p.agreement_number}` : ''}</p>
              <p className="small" style={{ margin: '0 0 8px' }}>
                Effective: <strong>{p.effective_date ? fmtDate(p.effective_date) : 'not set'}</strong>
                {p.term_end_date && <> · Term ends <strong>{fmtDate(p.term_end_date)}</strong>
                  {d !== null && <span className={d < 0 ? 'bad-text' : 'muted'}> · {d >= 0 ? `${d} days to go` : `${-d} days ago`}</span>}</>}
              </p>
              <div className="small" style={{ margin: '6px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Obligations achieved ({c.done} of {c.total})</span><strong>{pct}%</strong></div>
                <div style={{ height: 8, background: '#eef1ef', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)' }} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {plans?.length === 0 && <p className="card muted">No legacy transition plans yet.</p>}

      {levelOf(profile) >= 4 && (
        <details className="card no-print" open={sp.new === '1'} id="new">
          <summary><strong>+ Start a legacy transition plan</strong></summary>
          <form action={createLegacyPlan} className="grid2" style={{ marginTop: 12 }}>
            <label>Care setting name<input name="care_setting_name" required /></label>
            <label>Address of the care setting<input name="care_setting_address" /></label>
            <label>SHSS service type
              <select name="shss_service_type" defaultValue="">
                <option value="">Choose later</option>
                {SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>Agreement number<input name="agreement_number" /></label>
            <label>Effective date of agreement<input type="date" name="effective_date" /></label>
            <div style={{ gridColumn: '1 / -1' }}>
              <button type="submit">Create plan with the 25 standard obligations</button>
            </div>
          </form>
        </details>
      )}
    </main>
  );
}
