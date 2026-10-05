// Small shared pieces for the action item pages.
import { areaTitle } from '@/lib/kpis';
import { todayISO } from '@/lib/options';

export const STEPS = ['Open', 'In progress', 'Evidence submitted', 'Approved', 'Closed'];
export const isDoneStatus = (s) => s === 'Closed' || s === 'Dismissed';

export function Dot({ item }) {
  if (isDoneStatus(item.status)) return <span title="Closed">✅</span>;
  const overdue = item.due_date && item.due_date < todayISO();
  return <span title={overdue ? 'Overdue' : item.severity === 'red' ? 'Immediate action' : 'Attention required'}>{overdue || item.severity === 'red' ? '🔴' : '🟡'}</span>;
}

export function Chain({ status }) {
  if (status === 'Dismissed') return <p className="badge">Dismissed</p>;
  const at = STEPS.indexOf(status);
  return (
    <ol className="chain">
      {['Issue', 'Owner', 'Due date', ...STEPS.slice(1)].map((s, i) => {
        const done = i < 3 || at >= i - 2;
        return <li key={s} className={done ? 'done' : ''}>{s}</li>;
      })}
    </ol>
  );
}

export const categoryLabel = (k) => areaTitle(k);
