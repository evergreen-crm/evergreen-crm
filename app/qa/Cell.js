// One KPI value with its green / yellow / red colour.
import { STATUS } from '@/lib/kpis';

export default function Cell({ k, value }) {
  if (!k) return <td className="qa-cell qa-none muted">—</td>;
  return (
    <td className={`qa-cell qa-${k.status}`} title={k.detail ?? ''}>
      {k.status !== 'none' && <span aria-hidden="true">{STATUS[k.status].dot} </span>}
      {value ?? k.value}
    </td>
  );
}
