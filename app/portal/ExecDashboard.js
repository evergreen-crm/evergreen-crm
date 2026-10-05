// Top of the portal: operations dashboard tiles (by access level) + "Action required".
import Link from 'next/link';
import { levelOf } from '@/lib/levels';
import { fmtDate, todayISO } from '@/lib/options';
import { STATUS, loadKpiData, computeKpis, visibleKpis, overallCompliance } from '@/lib/kpis';

const TILES = [
  { key: 'active_residents', icon: '👥', label: 'Active residents' },
  { key: 'on_duty', icon: '👨‍⚕️', label: 'Staff on duty' },
  { key: 'open_incidents', icon: '📋', label: 'Open incidents' },
  { key: 'training', icon: '🎓', label: 'Training compliance' },
  { key: 'care_plans', icon: '✅', label: 'Care plans current' },
  { key: 'med_errors', icon: '🏥', label: 'Medication errors (month)' },
  { key: 'fire_drills', icon: '🛡️', label: 'Fire drills (month)' },
  { key: 'corrective_actions', icon: '📑', label: 'Open corrective actions' },
  { key: 'shift_coverage', icon: '🗓', label: 'Shift coverage (7 days)' },
  { key: 'payroll_hours', icon: '💵', label: 'Payroll hours (month)' },
];

export default async function ExecDashboard({ supabase, profile, userId }) {
  const lvl = levelOf(profile);
  const today = todayISO();
  const [{ data: mine, error }, kpis] = await Promise.all([
    supabase.from('action_items').select('id, title, due_date, status, severity').eq('owner_id', userId).not('status', 'in', '("Closed","Dismissed")').order('due_date').limit(8),
    lvl >= 2 ? loadKpiData(supabase).then((d) => visibleKpis(computeKpis(d), profile)) : Promise.resolve([]),
  ]);
  const by = Object.fromEntries(kpis.map((k) => [k.key, k]));
  const overall = overallCompliance(kpis);
  const tiles = TILES.filter((t) => by[t.key]);

  return (
    <section className="exec no-print-break">
      {lvl >= 3 && tiles.length > 0 && (
        <>
          <div className="exec-head">
            <h2>Operations dashboard</h2>
            {overall !== null && <span className={`exec-overall kpi-${overall >= 98 ? 'green' : overall >= 90 ? 'yellow' : 'red'}`}>{overall >= 98 ? '🟢' : overall >= 90 ? '🟡' : '🔴'} Overall compliance {overall}%</span>}
            <Link href="/kpi" className="small">All KPIs & scorecard →</Link>
          </div>
          <div className="exec-tiles">
            {tiles.map((t) => {
              const k = by[t.key];
              return (
                <Link key={t.key} href={k.href ?? '/kpi'} className={`exec-tile kpi-${k.status}`} title={k.detail}>
                  <span className="exec-icon">{t.icon}</span>
                  <strong>{k.value}</strong>
                  <span>{t.label} {k.status !== 'none' && STATUS[k.status].dot}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
      {lvl === 2 && kpis.length > 0 && <p className="small"><Link href="/kpi">📊 KPIs for your house →</Link></p>}
      {!error && (
        <div className="card action-box">
          <div className="exec-head"><h2>⚠️ Action required{mine?.length ? ` (${mine.length})` : ''}</h2><Link href="/action-items" className="small">All action items →</Link></div>
          {mine?.length ? (
            <ul className="action-list">
              {mine.map((i) => {
                const late = i.due_date && i.due_date < today;
                return <li key={i.id}><span>{late || i.severity === 'red' ? '🔴' : '🟡'}</span> <Link href={`/action-items/${i.id}`}>{i.title}</Link> <span className={`small ${late ? 'bad-text' : 'muted'}`}>{i.due_date ? `${late ? 'overdue since' : 'due'} ${fmtDate(i.due_date)}` : ''}</span></li>;
              })}
            </ul>
          ) : <p className="muted">Nothing assigned to you right now. 🎉</p>}
        </div>
      )}
    </section>
  );
}
