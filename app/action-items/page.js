// ACTION REQUIRED: every issue with an owner, due date and status.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDate, todayISO } from '@/lib/options';
import { scanActionItems } from './actions';
import { Dot, isDoneStatus, categoryLabel } from './ui';

const VIEWS = [
  { key: 'mine', label: 'Mine' },
  { key: 'open', label: 'All open' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'review', label: 'Waiting for approval' },
  { key: 'closed', label: 'Closed' },
];

export default async function ActionItems({ searchParams }) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const sp = await searchParams;
  const lvl = levelOf(profile);
  const view = sp.view ?? (lvl >= 3 ? 'open' : 'mine');
  const today = todayISO();

  const [{ data: items, error }, { data: people }, { data: homes }] = await Promise.all([
    supabase.from('action_items').select('*').order('due_date', { ascending: true, nullsFirst: false }).limit(500),
    supabase.from('profiles').select('id, full_name'),
    supabase.from('homes').select('id, name'),
  ]);
  const pName = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]));
  const hName = Object.fromEntries((homes ?? []).map((h) => [h.id, h.name]));
  const all = items ?? [];
  const open = all.filter((i) => !isDoneStatus(i.status));
  const filtered = {
    mine: open.filter((i) => i.owner_id === user.id),
    open,
    overdue: open.filter((i) => i.due_date && i.due_date < today),
    review: open.filter((i) => i.status === 'Evidence submitted' || i.status === 'Approved'),
    closed: all.filter((i) => isDoneStatus(i.status)).reverse(),
  }[view] ?? open;
  const count = (k) => ({ mine: open.filter((i) => i.owner_id === user.id).length, open: open.length, overdue: open.filter((i) => i.due_date && i.due_date < today).length, review: open.filter((i) => ['Evidence submitted', 'Approved'].includes(i.status)).length })[k];

  return (
    <main>
      <h1>Action required</h1>
      <p className="muted">Every issue has an owner, a due date and a status: Issue → Owner → Due date → Status → Evidence → Approval → Closed. Each step is recorded.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}
      {error && <p className="message">Action items aren’t set up yet. Run <code>supabase/kpi-actions.sql</code> in Supabase → SQL Editor.</p>}

      <div className="row no-print" style={{ alignItems: 'center' }}>
        {lvl >= 3 && <form action={scanActionItems}><button>🔄 Check for new issues now</button></form>}
        {lvl >= 2 && <Link className="button secondary" href="/action-items/new">+ Add an issue</Link>}
        <Link href="/kpi" className="small">See KPIs →</Link>
      </div>

      <nav className="tabs-bar">
        {VIEWS.map((v) => (
          <Link key={v.key} href={`/action-items?view=${v.key}`} className={view === v.key ? 'on' : ''}>
            {v.label}{count(v.key) ? ` (${count(v.key)})` : ''}
          </Link>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <p className="card muted">{view === 'mine' ? 'Nothing assigned to you. 🎉' : 'Nothing here.'}</p>
      ) : (
        <table>
          <thead><tr><th></th><th>Issue</th><th>Owner</th><th>Due</th><th>Status</th><th>Area</th><th>House</th></tr></thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id}>
                <td><Dot item={i} /></td>
                <td><Link href={`/action-items/${i.id}`}>{i.title}</Link>{i.auto && <span className="muted small"> · auto</span>}</td>
                <td>{pName[i.owner_id] ?? <span className="badge warn">Unassigned</span>}</td>
                <td className={i.due_date && i.due_date < today && !isDoneStatus(i.status) ? 'bad-text' : ''}>{i.due_date ? fmtDate(i.due_date) : '—'}</td>
                <td>{i.status}</td>
                <td className="small">{categoryLabel(i.category)}</td>
                <td className="small">{hName[i.home_id] ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
