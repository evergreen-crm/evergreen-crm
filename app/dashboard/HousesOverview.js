// Main dashboard: one card per house with its key KPIs, so every house can be compared at a glance.
import Link from 'next/link';
import { STATUS, loadKpiData } from '@/lib/kpis';
import { houseKpis, houseValue } from '@/lib/houseKpis';

const CARD_KPIS = [
  ['open_incidents', 'Open incidents'],
  ['mar_complete', 'Medication documentation'],
  ['care_plans', 'Care plans current'],
  ['contract_reqs', 'Required documents'],
  ['fire_drills', 'Fire drill this month'],
  ['training', 'Staff training'],
];

export default async function HousesOverview({ supabase, homes }) {
  if (!homes?.length) return null;
  const [data, { data: items }] = await Promise.all([
    loadKpiData(supabase),
    supabase.from('action_items').select('home_id, due_date, severity').not('status', 'in', '("Closed","Dismissed")'),
  ]);
  const today = data.today;
  return (
    <section>
      <h2>🏡 Houses</h2>
      <div className="house-cards">
        {homes.map((h) => {
          const { by, overall } = houseKpis(data, h.id);
          const oc = overall === null ? 'none' : overall >= 98 ? 'green' : overall >= 90 ? 'yellow' : 'red';
          const mine = (items ?? []).filter((i) => i.home_id === h.id);
          const late = mine.filter((i) => (i.due_date && i.due_date < today) || i.severity === 'red').length;
          const res = by.active_residents;
          const duty = by.on_duty;
          return (
            <Link key={h.id} href={`/homes/${h.id}?tab=dashboard`} className={`house-card kpi-${oc}`}>
              <div className="house-card-head">
                <strong>{h.name}</strong>
                <span className="small">{STATUS[oc].dot} {overall === null ? 'No data yet' : `${overall}%`}</span>
              </div>
              <div className="small muted">
                👥 {res ? res.value : 0}{h.capacity ? ` / ${h.capacity}` : ''} residents · 👨‍⚕️ {duty ? duty.value : 0} on duty · ⚠️ {mine.length} action item{mine.length === 1 ? '' : 's'}{late ? ` (${late} urgent)` : ''}
              </div>
              <ul className="house-kpis">
                {CARD_KPIS.filter(([k]) => by[k]).map(([k, label]) => (
                  <li key={k}><span>{STATUS[by[k].status].dot} {label}</span><strong>{houseValue(by[k])}</strong></li>
                ))}
              </ul>
              <span className="small">Open house dashboard →</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
