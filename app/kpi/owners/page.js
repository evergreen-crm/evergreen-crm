// KPI owners: who is accountable for each KPI. Level 4+ assigns; level 3 can view.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf, levelName } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import { AREAS, STATUS, loadKpiData, computeKpis } from '@/lib/kpis';
import { saveKpiOwners } from '../actions';

export const dynamic = 'force-dynamic';

export default async function KpiOwners({ searchParams }) {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const sp = await searchParams;
  const lvl = levelOf(profile);
  if (lvl < 3) redirect('/kpi');
  const canEdit = lvl >= 4;
  const data = await loadKpiData(supabase);
  const kpis = computeKpis(data);
  const staff = (data.profiles ?? []).filter((p) => p.active && p.role !== 'family')
    .sort((a, b) => levelOf(b) - levelOf(a) || (a.full_name ?? '').localeCompare(b.full_name ?? ''));
  const pName = Object.fromEntries((data.profiles ?? []).map((p) => [p.id, p.full_name]));
  const rows = Object.fromEntries((data.kpiOwnerRows ?? []).map((r) => [r.kpi_key, r]));
  const assigned = kpis.filter((k) => rows[k.key]?.owner_id).length;

  return (
    <main>
      <p className="small"><Link href="/kpi">← KPIs</Link></p>
      <h1>👤 KPI owners</h1>
      <p className="muted">Each KPI has one person who is accountable for it. When the automatic check finds a problem for a KPI, the action item goes to that KPI’s owner. If no one is assigned, it goes to the house’s Program Coordinator, then a Program Manager.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}
      {!canEdit && <p className="card small">Only the Director of Operations, Executive Director, CSO, CEO or an Administrator can change KPI owners.</p>}
      <p className="small"><strong>{assigned}</strong> of {kpis.length} KPIs have an owner.</p>

      <form action={saveKpiOwners}>
        {AREAS.map((a) => {
          const ks = kpis.filter((k) => k.area === a.key);
          if (!ks.length) return null;
          return (
            <section key={a.key} className="card">
              <h2>{a.icon} {a.num}. {a.title}</h2>
              <table>
                <thead><tr><th>KPI</th><th>Now</th><th>Owner</th><th className="small">Assigned</th></tr></thead>
                <tbody>
                  {ks.map((k) => {
                    const r = rows[k.key];
                    return (
                      <tr key={k.key}>
                        <td>{k.label}</td>
                        <td>{STATUS[k.status].dot} {k.value}</td>
                        <td>
                          {canEdit ? (
                            <select name={`owner_${k.key}`} defaultValue={r?.owner_id ?? ''}>
                              <option value="">— Not assigned (automatic) —</option>
                              {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {levelName(levelOf(p))}</option>)}
                            </select>
                          ) : (r?.owner_id ? pName[r.owner_id] ?? '—' : <span className="muted">Not assigned</span>)}
                        </td>
                        <td className="small muted">{r?.owner_id ? `${fmtDate(r.assigned_at.slice(0, 10))}${r.assigned_by ? ` by ${pName[r.assigned_by] ?? '—'}` : ''}` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
        {canEdit && <p className="no-print"><button>💾 Save KPI owners</button></p>}
      </form>
    </main>
  );
}
