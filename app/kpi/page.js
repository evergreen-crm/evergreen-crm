// KPI page: the 10 KPI areas with green / yellow / red status, plus the monthly scorecard.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import KpiCard from './KpiCard';
import { AREAS, STATUS, loadKpiData, computeKpis, visibleKpis, scorecard, overallCompliance } from '@/lib/kpis';

export const dynamic = 'force-dynamic';

export default async function KpiPage() {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  if (lvl < 2) redirect('/portal');
  const data = await loadKpiData(supabase);
  const kpis = visibleKpis(computeKpis(data), profile);
  const card = scorecard(kpis);
  const overall = overallCompliance(kpis);
  const counts = { red: kpis.filter((k) => k.status === 'red').length, yellow: kpis.filter((k) => k.status === 'yellow').length, green: kpis.filter((k) => k.status === 'green').length };

  return (
    <main>
      <h1>KPIs</h1>
      <p className="muted">Live from the records in the system · {fmtDate(data.today)} · {lvl >= 3 ? 'all houses' : 'your house'}. 🟢 on target · 🟡 attention required · 🔴 immediate action.</p>

      <div className="stats">
        <div className={`stat ${overall === null ? '' : overall >= 98 ? '' : overall >= 90 ? 'warn' : 'bad'}`}><strong>{overall === null ? '—' : `${overall}%`}</strong><span>Overall compliance</span></div>
        <div className={`stat ${counts.red ? 'bad' : ''}`}><strong>{counts.red}</strong><span>🔴 Immediate action</span></div>
        <div className={`stat ${counts.yellow ? 'warn' : ''}`}><strong>{counts.yellow}</strong><span>🟡 Attention required</span></div>
        <div className="stat"><strong>{counts.green}</strong><span>🟢 On target</span></div>
      </div>
      <p className="no-print"><Link className="button" href="/action-items">Open action items →</Link></p>

      <section className="card">
        <h2>Monthly scorecard — {new Date(data.today + 'T12:00:00').toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}</h2>
        <table>
          <thead><tr><th>Category</th><th>Target</th><th>Actual</th><th>Status</th></tr></thead>
          <tbody>
            {card.map((r) => (
              <tr key={r.label}><td>{r.label}</td><td>{r.label === 'Staffing' ? '95%' : r.target === 90 ? '90%+' : `${r.target}%`}</td>
                <td>{r.actual === null ? <span className="muted small">{r.note ?? 'No data yet'}</span> : `${r.actual}%`}</td><td>{STATUS[r.status].dot}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Each category is the average of its KPIs below. From Phase 2 a snapshot is saved on the 1st of every month so you can see trends.</p>
      </section>

      {AREAS.filter((a) => lvl >= a.minLevel).map((a) => {
        const ks = kpis.filter((k) => k.area === a.key);
        return (
          <section key={a.key}>
            <h2>{a.icon} {a.num}. {a.title}</h2>
            {ks.length ? <div className="kpis">{ks.map((k) => <KpiCard key={k.key} k={k} />)}</div>
              : <p className="muted small">No data yet for this area — these KPIs switch on in Phase 3 when the forms are added.</p>}
          </section>
        );
      })}
    </main>
  );
}
