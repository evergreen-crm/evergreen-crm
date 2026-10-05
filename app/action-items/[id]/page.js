// One action item: the full accountability chain and its audit trail.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf, personLabel } from '@/lib/levels';
import { fmtDate, fmtDateTime, todayISO } from '@/lib/options';
import { updateActionItem } from '../actions';
import { Chain, Dot, isDoneStatus, categoryLabel } from '../ui';

function Op({ id, op, label, className, children }) {
  return (
    <form action={updateActionItem} className="card">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      {children}
      <button className={className}>{label}</button>
    </form>
  );
}

export default async function ActionItem({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  const { data: it } = await supabase.from('action_items').select('*, homes(name), residents(first_name, last_name, preferred_name)').eq('id', id).maybeSingle();
  if (!it) notFound();
  const [{ data: events }, { data: people }] = await Promise.all([
    supabase.from('action_item_events').select('*').eq('item_id', id).order('at'),
    supabase.from('profiles').select('id, full_name, role, level, active').order('full_name'),
  ]);
  const pName = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]));
  const isOwner = it.owner_id === user.id;
  const mgr = lvl >= 3;
  const done = isDoneStatus(it.status);
  const overdue = it.due_date && it.due_date < todayISO() && !done;
  const canApprove = mgr && (profile.role === 'admin' || (it.owner_id !== user.id && it.evidence_by !== user.id));

  return (
    <main>
      <p className="small no-print"><Link href="/action-items">← Action required</Link></p>
      <h1><Dot item={it} /> {it.title}</h1>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}
      <Chain status={it.status} />

      <section className="card">
        <dl className="facts">
          <dt>Status</dt><dd><strong>{it.status}</strong>{overdue && <span className="badge bad"> Overdue</span>}</dd>
          <dt>Owner</dt><dd>{pName[it.owner_id] ?? 'Unassigned'}</dd>
          <dt>Due date</dt><dd>{it.due_date ? fmtDate(it.due_date) : '—'}</dd>
          <dt>Area</dt><dd>{categoryLabel(it.category)}</dd>
          <dt>Priority</dt><dd>{it.severity === 'red' ? '🔴 Immediate action' : '🟡 Attention required'}</dd>
          {it.homes?.name && <><dt>House</dt><dd>{it.homes.name}</dd></>}
          {it.residents && <><dt>Resident</dt><dd>{it.residents.preferred_name || it.residents.first_name} {it.residents.last_name}</dd></>}
          {it.subject_profile_id && <><dt>Staff member</dt><dd>{pName[it.subject_profile_id] ?? '—'}</dd></>}
          <dt>Raised</dt><dd>{fmtDateTime(it.created_at)} {it.auto ? '· by the automatic check' : `· by ${pName[it.created_by] ?? '—'}`}</dd>
        </dl>
        {it.details && <p>{it.details}</p>}
        {it.link && <p><Link className="button secondary" href={it.link}>Go to the record to fix it →</Link></p>}
      </section>

      {(it.evidence_note || it.approved_at || it.closed_at) && (
        <section className="card">
          <h2>Evidence & approval</h2>
          {it.evidence_note && <p><strong>Evidence</strong> ({pName[it.evidence_by] ?? '—'}, {fmtDateTime(it.evidence_at)}): {it.evidence_note}{it.evidence_link && <> · <a href={it.evidence_link}>Open evidence</a></>}</p>}
          {it.approved_at && <p><strong>Approved</strong> by {pName[it.approved_by] ?? '—'}, {fmtDateTime(it.approved_at)}</p>}
          {it.closed_at && <p><strong>{it.status}</strong> by {pName[it.closed_by] ?? 'system'}, {fmtDateTime(it.closed_at)}{it.closed_note ? ` — ${it.closed_note}` : ''}</p>}
        </section>
      )}

      <div className="grid2 no-print">
        {!done && (isOwner || mgr) && it.status === 'Open' && <Op id={id} op="start" label="Start working on it"><p className="muted small">Lets everyone know you’re on it.</p></Op>}
        {!done && (isOwner || mgr) && ['Open', 'In progress'].includes(it.status) && (
          <Op id={id} op="evidence" label="Submit evidence">
            <h2>Submit evidence</h2>
            <label>What was done<textarea name="note" rows={3} required placeholder="e.g. First aid renewed 2026-10-10, certificate uploaded to HR file" /></label>
            <label>Link to the evidence (optional)<input name="evidence_link" placeholder="Link to the record, certificate or document" /></label>
          </Op>
        )}
        {!done && it.status === 'Evidence submitted' && canApprove && <Op id={id} op="approve" label="Approve"><h2>Approve evidence</h2><p className="muted small">Confirm the evidence fixes the issue.</p></Op>}
        {!done && it.status === 'Evidence submitted' && mgr && !canApprove && <p className="card muted">Another manager needs to approve this — you can’t approve evidence you submitted.</p>}
        {!done && it.status === 'Approved' && mgr && <Op id={id} op="close" label="Close"><h2>Close</h2><label>Closing note (optional)<input name="note" /></label></Op>}
        {!done && mgr && (
          <Op id={id} op="assign" label="Save owner & due date" className="secondary">
            <h2>Owner & due date</h2>
            <label>Owner<select name="owner_id" defaultValue={it.owner_id ?? ''}>
              <option value="">— Unassigned —</option>
              {(people ?? []).filter((p) => p.active && p.role !== 'family').map((p) => <option key={p.id} value={p.id}>{p.full_name} ({personLabel(p)})</option>)}
            </select></label>
            <label>Due date<input type="date" name="due_date" defaultValue={it.due_date ?? ''} /></label>
            <label>Note (optional)<input name="note" /></label>
          </Op>
        )}
        {!done && mgr && <Op id={id} op="dismiss" label="Dismiss" className="danger"><h2>Dismiss</h2><label>Reason<input name="note" required placeholder="e.g. Duplicate, or not applicable" /></label></Op>}
        {done && mgr && <Op id={id} op="reopen" label="Reopen" className="secondary"><p className="muted small">Reopen if the problem came back.</p></Op>}
      </div>

      <section className="card">
        <h2>Audit trail</h2>
        <ol className="timeline">
          {(events ?? []).map((e) => (
            <li key={e.id}><span className="small muted">{fmtDateTime(e.at)}</span> — <strong>{e.action}</strong> by {pName[e.actor_id] ?? 'system'}{e.note ? `: ${e.note}` : ''}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
