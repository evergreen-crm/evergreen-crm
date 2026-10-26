// 🏅 QA dashboard: every COA standard area, with each house side by side.
// Green = on target, yellow = attention, red = immediate action. Click a red or yellow number to open
// the record behind it, or "+ Action" to start an improvement action (corrective action plan).
import Link from 'next/link';
import { loadKpiData, computeKpis, STATUS } from '@/lib/kpis';
import { filterForHome, houseValue } from '@/lib/houseKpis';
import { COA_AREAS, areaScore, scoreColor } from '@/lib/qa';
import { requireQa } from './guard';
import QaShell from './QaShell';
import Cell from './Cell';

export const dynamic = 'force-dynamic';

export default async function QaDashboard() {
  const { supabase, profile } = await requireQa('/qa');
  const d = await loadKpiData(supabase);
  const homes = d.homes ?? [];
  const org = computeKpis(d);
  const orgBy = Object.fromEntries(org.map((k) => [k.key, k]));
  const houseBy = Object.fromEntries(homes.map((h) => [h.id, Object.fromEntries(computeKpis(filterForHome(d, h.id)).map((k) => [k.key, k]))]));
  const cols = [{ id: 'org', name: 'All of Evergreen', by: orgBy }, ...homes.map((h) => ({ id: h.id, name: h.name, by: houseBy[h.id] }))];

  // Readiness per column = average of the area scores that have data.
  const readiness = (by) => {
    const s = COA_AREAS.map((a) => areaScore(a.kpis.map((k) => by[k]).filter(Boolean))).filter((x) => x !== null);
    return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
  };
  const { data: openActions } = await supabase.from('action_items').select('id, due_date, status, severity').not('status', 'in', '("Closed","Dismissed","Approved")');
  const today = d.today;
  const overdue = (openActions ?? []).filter((a) => a.due_date && a.due_date < today).length;

  return (
    <QaShell active="/qa" title="Quality assurance — dashboard" printedBy={profile.full_name}
      intro="Live from the CRM. Each row is evidence for a COA standard area; the score is the share of measures on target (yellow counts half). Aim for 90% or more in every area before the accreditation survey.">
      <section className="qa-summary">
        {cols.map((c) => {
          const v = readiness(c.by);
          return (
            <div key={c.id} className={`qa-score kpi-${scoreColor(v)}`}>
              <span className="small muted">{c.name}</span>
              <strong>{v === null ? '—' : `${v}%`}</strong>
              <span className="small">COA readiness</span>
            </div>
          );
        })}
        <Link href="/qa/actions" className={`qa-score kpi-${overdue ? 'red' : (openActions ?? []).length ? 'yellow' : 'green'}`}>
          <span className="small muted">Improvement actions</span>
          <strong>{(openActions ?? []).length}</strong>
          <span className="small">open{overdue ? ` · ${overdue} overdue` : ''}</span>
        </Link>
      </section>

      {COA_AREAS.map((a) => (
        <section key={a.code} className="card qa-area">
          <div className="title-row">
            <h2 style={{ margin: 0 }}>{a.icon} {a.code} — {a.title}</h2>
            <span className="muted small">{a.carf}</span>
          </div>
          <p className="small muted" style={{ margin: '4px 0 8px' }}>{a.what}</p>
          <div className="table-wrap">
            <table className="qa-table">
              <thead>
                <tr><th>Measure</th><th>Target</th>{cols.map((c) => <th key={c.id}>{c.name}</th>)}<th className="no-print"></th></tr>
              </thead>
              <tbody>
                {a.kpis.map((key) => {
                  const base = orgBy[key];
                  if (!base) return null;
                  const bad = cols.some((c) => ['red', 'yellow'].includes(c.by[key]?.status));
                  return (
                    <tr key={key}>
                      <td>{base.href ? <Link href={base.href}>{base.label}</Link> : base.label}</td>
                      <td className="small muted">{base.target}</td>
                      {cols.map((c) => <Cell key={c.id} k={c.by[key]} value={c.id === 'org' ? undefined : c.by[key] && houseValue(c.by[key])} />)}
                      <td className="no-print">{bad && <Link className="small" href={`/qa/actions?new=1&std=${a.code}&title=${encodeURIComponent(`${a.code}: ${base.label} below target`)}`}>+ Action</Link>}</td>
                    </tr>
                  );
                })}
                <tr className="qa-total">
                  <td colSpan={2}><strong>{a.code} score</strong></td>
                  {cols.map((c) => { const v = areaScore(a.kpis.map((k) => c.by[k]).filter(Boolean)); return <td key={c.id} className={`qa-cell qa-${scoreColor(v)}`}><strong>{v === null ? '—' : `${v}%`}</strong></td>; })}
                  <td className="no-print"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p className="muted small">{STATUS.green.dot} On target · {STATUS.yellow.dot} Attention required · {STATUS.red.dot} Immediate action · ⚪ No data yet. Coming next (Phase 2): COA standards tracker with evidence binder, resident file audits and the quarterly QA report.</p>
    </QaShell>
  );
}
