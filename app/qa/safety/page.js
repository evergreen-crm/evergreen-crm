// 🔥 Health & safety (COA ASE): for each house, month by month — fire drill, safety check and the
// monthly facility inspection (Portal → Quality assurance → Tool B). A missed month shows red.
import Link from 'next/link';
import { fmtDate, todayISO } from '@/lib/options';
import { lastMonths, monthLabel } from '@/lib/qa';
import { requireQa } from '../guard';
import QaShell from '../QaShell';
import EntryForm from '@/app/components/EntryForm';

export const dynamic = 'force-dynamic';

const CHECKS = [
  { key: 'fire_drill', label: '🔥 Fire / emergency drill', how: 'House page → Safety → Fire drill', link: (h) => `/homes/${h}?tab=safety` },
  { key: 'safety_check', label: '🛡️ Safety check', how: 'House page → Safety → Safety check', link: (h) => `/homes/${h}?tab=safety` },
  { key: 'inspection', label: '📋 Monthly facility inspection (Tool B)', how: 'Portal → Quality assurance → Monthly facility safety inspection', link: () => '/portal/qa/tool-b' },
];

export default async function QaSafety() {
  const { supabase, profile } = await requireQa('/qa/safety');
  const today = todayISO();
  const months = lastMonths(today, 12);
  const from = `${months[0]}-01`;
  const [{ data: homes }, { data: entries }, { data: inspections }] = await Promise.all([
    supabase.from('homes').select('id, name, created_at').order('name'),
    supabase.from('entries').select('home_id, kind, entry_date').in('kind', ['fire_drill', 'safety_check']).gte('entry_date', from),
    supabase.from('records').select('id, home_id, record_date, status, data').eq('division', 'qa').eq('area', 'tool-b').gte('record_date', from),
  ]);
  const done = {}; // `${kind}:${home}:${ym}` -> list
  for (const e of entries ?? []) (done[`${e.kind}:${e.home_id}:${e.entry_date.slice(0, 7)}`] ??= []).push(e);
  for (const r of inspections ?? []) (done[`inspection:${r.home_id}:${r.record_date.slice(0, 7)}`] ??= []).push(r);
  const thisMonth = today.slice(0, 7);

  // A month before the house existed in the CRM is not counted.
  const stateOf = (kind, h, m) => {
    const got = done[`${kind}:${h.id}:${m}`];
    if (got?.length) {
      if (kind === 'inspection' && got.some((r) => Number(r.data?.p1 ?? 0) > 0)) return { cls: 'yellow', text: '⚠️', title: 'Done — Priority 1 deficiencies found' };
      return { cls: 'green', text: '✓', title: `Done (${got.length})` };
    }
    if (m < String(h.created_at ?? '').slice(0, 7)) return { cls: 'none', text: '', title: 'Before this house was set up' };
    if (m === thisMonth) return { cls: 'yellow', text: '…', title: 'Due by the end of this month' };
    return { cls: 'red', text: '✗', title: 'Missed' };
  };
  const rate = (kind, h) => {
    const counted = months.filter((m) => m !== thisMonth && stateOf(kind, h, m).cls !== 'none');
    if (!counted.length) return null;
    return Math.round((100 * counted.filter((m) => ['green', 'yellow'].includes(stateOf(kind, h, m).cls)).length) / counted.length);
  };

  return (
    <QaShell active="/qa/safety" title="Quality assurance — health & safety" printedBy={profile.full_name}
      intro="COA ASE (Administrative and Service Environment). Every house needs a fire drill, a safety check and a facility inspection every month — record them right here under each house. ✓ done · ⚠️ done with Priority 1 deficiencies · … due this month · ✗ missed.">
      {!(homes ?? []).length ? <p className="card muted">No houses yet.</p> : (homes ?? []).map((h) => (
        <section key={h.id} className="card">
          <h2 style={{ marginTop: 0 }}>🏡 {h.name}</h2>
          <div className="table-wrap">
            <table className="qa-table qa-grid">
              <thead><tr><th>Check</th>{months.map((m) => <th key={m}>{monthLabel(m)}</th>)}<th>On time</th></tr></thead>
              <tbody>{CHECKS.map((c) => {
                const v = rate(c.key, h);
                return (
                  <tr key={c.key}>
                    <td><Link href={c.link(h.id)}>{c.label}</Link><br /><span className="muted small">{c.how}</span></td>
                    {months.map((m) => { const s = stateOf(c.key, h, m); return <td key={m} className={`qa-cell qa-${s.cls}`} title={s.title} style={{ textAlign: 'center' }}>{s.text}</td>; })}
                    <td className={`qa-cell qa-${v === null ? 'none' : v === 100 ? 'green' : v >= 80 ? 'yellow' : 'red'}`}><strong>{v === null ? '—' : `${v}%`}</strong></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          {(() => {
            const last = (inspections ?? []).filter((r) => r.home_id === h.id).sort((a, b) => b.record_date.localeCompare(a.record_date))[0];
            return <p className="small muted" style={{ marginBottom: 0 }}>Last inspection: {last ? <><Link href={`/portal/record/${last.id}`}>{fmtDate(last.record_date)}</Link> — {last.data?.result ?? last.status}{last.data?.pm_signed === 'yes' || last.data?.pm_signed === true ? ' · PM signed off' : ''}</> : 'none on file'}</p>;
          })()}
          <div className="qa-safety-entry no-print">
            <EntryForm kind="fire_drill" homeId={h.id} path="/qa/safety" title={`Record a fire drill — ${h.name}`} />
            <EntryForm kind="safety_check" homeId={h.id} path="/qa/safety" title={`Record a safety check — ${h.name}`} />
            <p className="small" style={{ margin: '4px 0 0' }}><Link href="/portal/qa/tool-b">+ Monthly facility inspection (Tool B) →</Link> · <Link href="/qa/records/inspections#new">+ Outside inspection (fire, licensing, WorkSafeBC) →</Link></p>
          </div>
        </section>
      ))}
    </QaShell>
  );
}
