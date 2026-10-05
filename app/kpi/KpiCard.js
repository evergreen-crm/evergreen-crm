// One KPI tile: value, target, colour and what's behind it.
import Link from 'next/link';
import { STATUS } from '@/lib/kpis';

export default function KpiCard({ k, owner }) {
  return (
    <Link href={k.href ?? '#'} className={`kpi kpi-${k.status}`}>
      <span className="kpi-top"><span>{k.label}</span><span title={STATUS[k.status].label}>{STATUS[k.status].dot}</span></span>
      <strong>{k.value}</strong>
      <span className="small muted">Target: {k.target}</span>
      {k.detail && <span className="small">{k.detail}</span>}
      {owner !== undefined && <span className="small muted">👤 {owner ?? 'No owner assigned'}</span>}
    </Link>
  );
}
