// KPI page: the 10 KPI areas with green / yellow / red status, plus the monthly scorecard.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import KpiCard from './KpiCard';
import { AREAS, STATUS, SCORECARD, loadKpiData, computeKpis, visibleKpis, scorecard, overallCompliance } from '@/lib/kpis';

export const dynamic = 'force-dynamic';

export default async function KpiPage() {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  if (lvl < 2) redirect('/portal');
  const [data, { data: snaps }] = await Promise.all([
    loadKpiData(supabase),
    supabase.from('kpi_snapshots').select('month, taken_on, overall, scorecard').order('month', { ascending: false }).limit(6),
  ]);
  const months = (snaps ?? []).slice().reverse();
  const mLabel = (m) => new Date(m + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', year: 'numeric' });
  const cell = (v, target) => v === null || v === undefined ? <span className="muted">—</span> : <>{v >= target ? '🟢' : v >= target - 5 ? '🟡' : '🔴'} {v}%</>;
  const kpis = visibleKpis(computeKpis(data), profile);
  const card = scorecard(kpis);
  const overall = overallCompliance(kpis);
  const pName = Object.fromEntries((data.profiles ?? []).map((p) => [p.id, p.full_name]));
  const ownerOf = (key) => (data.kpiOwners[key] ? pName[data.kpiOwners[key]] ?? '—' : null);
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
      <p className="no-print row"><Link className="button" href="/action-items">Open action items →</Link>{lvl >= 3 && <Link className="button secondary" href="/kpi/owners">👤 {lvl >= 4 ? 'Assign KPI owners' : 'KPI owners'}</Link>}</p>

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
        <p className="muted small">Each category is the average of its KPIs below. The scorecard is saved automatically every morning; the last save of each month is that month’s final figure.</p>
      </section>

      {months.length > 0 && (
        <section className="card">
          <h2>📈 Trend by month</h2>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Category</th>{months.map((m) => <th key={m.month}>{mLabel(m.month)}</th>)}</tr></thead>
              <tbody>
                <tr><td><strong>Overall compliance</strong></td>{months.map((m) => <td key={m.month}><strong>{cell(m.overall === null ? null : Number(m.overall), 98)}</strong></td>)}</tr>
                {SCORECARD.filter((r) => r.keys.length).map((r) => (
                  <tr key={r.label}><td>{r.label}</td>{months.map((m) => { const row = (m.scorecard ?? []).find((x) => x.label === r.label); return <td key={m.month}>{cell(row?.actual, r.target)}</td>; })}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">The current month shows the latest figures (saved {fmtDate(months.at(-1).taken_on)}).</p>
        </section>
      )}

      {AREAS.filter((a) => lvl >= a.minLevel).map((a) => {
        const ks = kpis.filter((k) => k.area === a.key);
        return (
          <section key={a.key}>
            <h2>{a.icon} {a.num}. {a.title}</h2>
            {ks.length ? <div className="kpis">{ks.map((k) => <KpiCard key={k.key} k={k} owner={ownerOf(k.key)} />)}</div>
              : <p className="muted small">No data yet for this area — these KPIs switch on in Phase 3 when the forms are added.</p>}
          </section>
        );
      })}
    </main>
  );
}
