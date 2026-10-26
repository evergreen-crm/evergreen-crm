// 🛠 Improvement actions (COA PQI): every open corrective action, who owns it, when it's due,
// and whether actions get finished on time. New ones can be started here.
import Link from 'next/link';
import { fmtDate, addDaysISO, todayISO } from '@/lib/options';
import { areaTitle } from '@/lib/kpis';
import { personLabel } from '@/lib/levels';
import { COA_AREAS } from '@/lib/qa';
import { plainError } from '@/lib/plain';
import { requireQa } from '../guard';
import QaShell from '../QaShell';
import { createQaAction } from '../actions';

export const dynamic = 'force-dynamic';
const DONE = ['Closed', 'Dismissed'];

export default async function QaActions({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, user, profile } = await requireQa('/qa/actions');
  const today = todayISO();
  const show = ['open', 'overdue', 'done', 'all'].includes(sp.show) ? sp.show : 'open';
  const [{ data: items }, { data: homes }, { data: people }] = await Promise.all([
    supabase.from('action_items').select('id, title, category, severity, status, due_date, home_id, owner_id, created_at, closed_at, approved_at, auto, owner:owner_id(full_name), home:home_id(name)').order('due_date', { ascending: true, nullsFirst: false }).limit(1000),
    supabase.from('homes').select('id, name').order('name'),
    supabase.from('profiles').select('id, full_name, role, level').eq('active', true).neq('role', 'family').order('full_name'),
  ]);
  const all = items ?? [];
  const open = all.filter((i) => !DONE.includes(i.status));
  const overdue = open.filter((i) => i.due_date && i.due_date < today && i.status !== 'Approved');
  // On time = finished (approved or closed) on or before the due date, for actions due in the last 12 months.
  const yearAgo = addDaysISO(today, -365);
  const dueYear = all.filter((i) => i.status !== 'Dismissed' && i.due_date && i.due_date >= yearAgo && i.due_date <= today);
  const finished = (i) => (i.approved_at ?? i.closed_at)?.slice(0, 10);
  const onTime = dueYear.filter((i) => finished(i) && finished(i) <= i.due_date).length;
  const rate = dueYear.length ? Math.round((100 * onTime) / dueYear.length) : null;
  const list = show === 'open' ? open : show === 'overdue' ? overdue : show === 'done' ? all.filter((i) => DONE.includes(i.status)) : all;
  const stdOf = (t) => COA_AREAS.find((a) => String(t).startsWith(`${a.code}:`))?.code;

  return (
    <QaShell active="/qa/actions" title="Quality assurance — improvement actions" printedBy={profile.full_name}
      intro="COA PQI (Performance and Quality Improvement): every problem found gets an owner, a fix, a due date and proof it worked. Target: 90% finished by the due date.">
      {sp.ok && <p className="message ok no-print">{sp.ok}</p>}
      {sp.error && <p className="message error no-print">{plainError(sp.error)}</p>}

      <section className="qa-summary">
        <div className={`qa-score kpi-${open.length ? 'yellow' : 'green'}`}><span className="small muted">Open</span><strong>{open.length}</strong><span className="small">actions</span></div>
        <div className={`qa-score kpi-${overdue.length ? 'red' : 'green'}`}><span className="small muted">Overdue</span><strong>{overdue.length}</strong><span className="small">past due date</span></div>
        <div className={`qa-score kpi-${rate === null ? 'none' : rate >= 90 ? 'green' : rate >= 75 ? 'yellow' : 'red'}`}><span className="small muted">Finished on time</span><strong>{rate === null ? '—' : `${rate}%`}</strong><span className="small">{onTime} of {dueYear.length} (12 months)</span></div>
      </section>

      {sp.new ? (
        <form action={createQaAction} className="card no-print">
          <h2 style={{ marginTop: 0 }}>New improvement action</h2>
          <div className="row">
            <label>COA standard area<select name="std" defaultValue={sp.std ?? 'PQI'}>{COA_AREAS.map((a) => <option key={a.code} value={a.code}>{a.code} — {a.title}</option>)}</select></label>
            <label>Priority<select name="severity" defaultValue="yellow"><option value="yellow">🟡 Attention required</option><option value="red">🔴 Immediate action</option></select></label>
          </div>
          <label>What needs to improve<input name="title" required maxLength={200} defaultValue={sp.title ?? ''} placeholder="e.g. Fire drills missed at Maple House in August and September" /></label>
          <label>Why it happened (root cause)<textarea name="cause" rows={2} placeholder="e.g. No one was assigned the drill after the PC changed" /></label>
          <label>What we will do<textarea name="fix" rows={2} placeholder="e.g. PC schedules the drill in the first week of every month; PM checks on the 10th" /></label>
          <label>How we will know it worked<textarea name="check" rows={2} placeholder="e.g. 3 months in a row with a drill done by the 10th" /></label>
          <div className="row">
            <label>House<select name="home_id" defaultValue={sp.house ?? ''}><option value="">— Organization-wide —</option>{(homes ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
            <label>Owner<select name="owner_id" defaultValue={user.id}>{(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name} ({personLabel(p)})</option>)}</select></label>
            <label>Due date<input type="date" name="due_date" required min={today} defaultValue={addDaysISO(today, 30)} /></label>
          </div>
          <div className="row"><button>Save improvement action</button><Link className="button secondary" href="/qa/actions">Cancel</Link></div>
        </form>
      ) : <p className="no-print"><Link className="button" href="/qa/actions?new=1">+ New improvement action</Link></p>}

      <section className="card">
        <div className="title-row">
          <h2 style={{ margin: 0 }}>Actions</h2>
          <span className="small no-print">{[['open', 'Open'], ['overdue', 'Overdue'], ['done', 'Closed'], ['all', 'All']].map(([k, l], i) => <span key={k}>{i ? ' · ' : ''}{show === k ? <strong>{l}</strong> : <Link href={`/qa/actions?show=${k}`}>{l}</Link>}</span>)}</span>
        </div>
        {!list.length ? <p className="muted small">None here.</p> : (
          <div className="table-wrap">
            <table className="qa-table">
              <thead><tr><th>Action</th><th>COA</th><th>House</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>{list.map((i) => {
                const late = !DONE.includes(i.status) && i.status !== 'Approved' && i.due_date && i.due_date < today;
                return (
                  <tr key={i.id}>
                    <td>{i.severity === 'red' ? '🔴' : '🟡'} <Link href={`/action-items/${i.id}`}>{i.title}</Link><br /><span className="muted small">{areaTitle(i.category)}{i.auto ? ' · found automatically' : ''}</span></td>
                    <td className="small">{stdOf(i.title) ?? '—'}</td>
                    <td className="small">{i.home?.name ?? 'Organization'}</td>
                    <td className="small">{i.owner?.full_name ?? '—'}</td>
                    <td className={`small ${late ? 'bad-text' : ''}`}>{i.due_date ? fmtDate(i.due_date) : '—'}{late ? ' · overdue' : ''}</td>
                    <td><span className={`badge ${DONE.includes(i.status) ? '' : late ? 'bad' : 'warn'}`}>{i.status}</span></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </QaShell>
  );
}
