// One launch plan: milestones and tasks, documents needed before opening, and plan details.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDate, todayISO, daysUntil, addDaysISO } from '@/lib/options';
import { updatePlan, setTask, setMilestone, updateDocument } from '../actions';

const TABS = [
  { key: 'milestones', label: '🏁 Milestones' },
  { key: 'documents', label: '📑 Documents before opening' },
  { key: 'details', label: '📋 Plan details' },
];
const DOC_STATUSES = ['Not started', 'Drafting', 'Ready for approval', 'Approved', 'Submitted to MCFD', 'Not applicable'];
const PLAN_STATUSES = ['Draft', 'Submitted', 'Contract signed', 'In progress', 'Complete'];
const DOC_FILTERS = [
  { key: 'todo', label: 'To do' }, { key: 'late', label: 'Overdue / this week' },
  { key: 'required', label: 'MCFD & legal' }, { key: 'all', label: 'All' },
];
const DONE = ['Approved', 'Submitted to MCFD', 'Not applicable'];

function Hidden({ planId, tab }) {
  return <><input type="hidden" name="plan_id" value={planId} /><input type="hidden" name="tab" value={tab} /></>;
}

export default async function LaunchPlan({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab : 'milestones';
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const lvl = levelOf(profile);
  const { data: plan } = await supabase.from('launch_plans').select('*').eq('id', id).maybeSingle();
  if (!plan) notFound();
  const [{ data: milestones }, { data: docs }, { data: ready }] = await Promise.all([
    supabase.from('launch_milestones').select('*').eq('plan_id', id).order('number'),
    supabase.from('launch_documents_due').select('*').eq('plan_id', id).order('sort'),
    supabase.from('launch_readiness').select('*').eq('plan_id', id).maybeSingle(),
  ]);
  const { data: tasks } = await supabase.from('launch_tasks').select('*')
    .in('milestone_id', (milestones ?? []).map((m) => m.id)).order('sort');
  const today = todayISO();
  const byMs = {};
  for (const t of tasks ?? []) (byMs[t.milestone_id] ??= []).push(t);
  const msDone = (milestones ?? []).filter((m) => m.completed_on).length;
  const d = daysUntil(plan.opening_date);
  const late = (docs ?? []).filter((x) => x.due_status === 'Overdue').length;
  const week = (docs ?? []).filter((x) => x.due_status === 'Due this week').length;

  return (
    <main>
      <p className="small no-print"><Link href="/launch">← Launch plans</Link></p>
      <h1>{plan.care_setting_name ?? 'Care setting TBD'}</h1>
      <p className="muted">{plan.service_type} · Status: <strong>{plan.status}</strong> · Agency: Evergreen Community Care</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}

      <div className="stats">
        <div className={`stat ${d !== null && d < 14 && plan.status !== 'Complete' ? 'warn' : ''}`}>
          <strong>{plan.opening_date ? (d >= 0 ? d : 'Open') : '—'}</strong>
          <span>{plan.opening_date ? `days to opening (${fmtDate(plan.opening_date)})` : 'Set the opening date in Plan details'}</span>
        </div>
        <div className={`stat ${ready && ready.required_done < ready.required_total ? 'warn' : ''}`}>
          <strong>{ready?.required_done ?? 0}/{ready?.required_total ?? 0}</strong><span>MCFD & legal documents done</span>
        </div>
        <div className="stat"><strong>{ready?.pct_ready ?? 0}%</strong><span>all pre-opening documents</span></div>
        <div className="stat"><strong>{msDone}/{milestones?.length ?? 0}</strong><span>milestones complete</span></div>
        <div className={`stat ${late ? 'bad' : week ? 'warn' : ''}`}><strong>{late}</strong><span>documents overdue{week ? ` · ${week} due this week` : ''}</span></div>
      </div>

      <nav className="tabs-bar">
        {TABS.map((t) => <Link key={t.key} href={`/launch/${id}?tab=${t.key}`} className={tab === t.key ? 'on' : ''}>{t.label}</Link>)}
      </nav>

      {tab === 'milestones' && <Milestones />}
      {tab === 'documents' && <Documents />}
      {tab === 'details' && <Details />}
    </main>
  );

  function Milestones() {
    return (
      <>
        <p className="muted small">Proposed days come from the Appendix E plan. {plan.contract_effective_date ? `Target dates count from the contract effective date (${fmtDate(plan.contract_effective_date)}).` : 'Target dates appear once the contract effective date is entered.'} Program Manager or above can tick tasks off.</p>
        {(milestones ?? []).map((m) => {
          const list = byMs[m.id] ?? [];
          const open = list.filter((t) => !t.is_heading && !t.completed_on).length;
          const target = plan.contract_effective_date && m.proposed_days ? addDaysISO(plan.contract_effective_date, m.proposed_days) : null;
          return (
            <section key={m.id} className="card" id={`m${m.number}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0 }}>{m.completed_on ? '✅' : '⬜'} Milestone {m.number}: {m.title}</h2>
                <span className="small muted">
                  {m.proposed_days ? `${m.proposed_days} days` : <span className="badge warn">days not set</span>}
                  {target && <> · target {fmtDate(target)}</>}
                  {m.completed_on && <> · done {fmtDate(m.completed_on)}</>}
                </span>
              </div>
              {m.deliverable && <p className="small"><strong>Deliverable:</strong> {m.deliverable}</p>}
              <ul className="checklist">
                {list.map((t) => t.is_heading ? (
                  <li key={t.id}><strong className="small">{t.task}</strong></li>
                ) : (
                  <li key={t.id} className={t.completed_on ? 'done' : ''}>
                    <span className="req-text"><span className="tick">{t.completed_on ? '✓' : ''}</span>
                      <span>{t.task}{t.sort > 100 && <span className="badge" style={{ marginLeft: 6 }}>retention</span>}
                        {t.completed_on && <span className="muted small"> · {fmtDate(t.completed_on)}</span>}</span>
                    </span>
                    <form action={setTask} className="no-print">
                      <Hidden planId={id} tab="milestones" />
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="done" value={t.completed_on ? '0' : '1'} />
                      <button className={t.completed_on ? 'link' : 'secondary'}>{t.completed_on ? 'Undo' : 'Mark done'}</button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={setMilestone} className="row no-print" style={{ alignItems: 'end', marginTop: 10 }}>
                <Hidden planId={id} tab="milestones" />
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="done" value={m.completed_on ? '0' : '1'} />
                {!m.completed_on && <label>Actual date of completion<input type="date" name="date" defaultValue={today} /></label>}
                <label>Notes<input name="notes" defaultValue={m.notes ?? ''} placeholder="Optional" /></label>
                <button className={m.completed_on ? 'secondary' : ''} disabled={!m.completed_on && open > 0} title={open > 0 ? 'Finish the tasks first' : ''}>
                  {m.completed_on ? 'Reopen milestone' : open > 0 ? `${open} task${open > 1 ? 's' : ''} left` : 'Mark milestone complete'}
                </button>
              </form>
            </section>
          );
        })}
      </>
    );
  }

  function Documents() {
    const f = DOC_FILTERS.some((x) => x.key === sp.f) ? sp.f : 'todo';
    const rows = (docs ?? []).filter((x) =>
      f === 'all' ? true : f === 'required' ? x.requirement !== 'Best practice'
        : f === 'late' ? ['Overdue', 'Due this week'].includes(x.due_status) : !DONE.includes(x.status));
    let cat = null;
    return (
      <>
        <p className="muted small">Best-practice checklist for opening. <strong>MCFD required</strong> items come from the SHSS Service Provider Guidebook; <strong>Legal</strong> items from WorkSafeBC, municipal and insurance requirements. Due dates count back from the opening date. Paste the SharePoint / OneDrive link for each document.</p>
        <nav className="tabs-bar">
          {DOC_FILTERS.map((x) => <Link key={x.key} href={`/launch/${id}?tab=documents&f=${x.key}`} className={f === x.key ? 'on' : ''}>{x.label}</Link>)}
        </nav>
        {rows.length === 0 ? <p className="card muted">Nothing here. 🎉</p> : (
          <table>
            <thead><tr><th>Document</th><th>Type</th><th>Owner</th><th>Due</th><th>Status & link</th></tr></thead>
            <tbody>
              {rows.map((x) => {
                const head = x.category !== cat ? (cat = x.category) : null;
                return [
                  head && <tr key={`h-${head}`}><td colSpan={5} style={{ background: '#f4f7f5' }}><strong>{head}</strong></td></tr>,
                  <tr key={x.document_id}>
                    <td>{x.document}{x.source_notes && <div className="muted small">{x.source_notes}</div>}
                      {x.file_link && <div className="small"><a href={x.file_link} target="_blank" rel="noreferrer">Open document ↗</a></div>}</td>
                    <td className="small">{x.requirement === 'MCFD required' ? <span className="badge bad">MCFD</span> : x.requirement === 'Legal requirement' ? <span className="badge warn">Legal</span> : <span className="badge">Best practice</span>}</td>
                    <td className="small">{x.owner_role}</td>
                    <td className={`small ${x.due_status === 'Overdue' ? 'bad-text' : ''}`}>
                      {x.due_date ? fmtDate(x.due_date) : x.due_status === 'Contract-dated' ? 'From contract date' : '—'}
                      <div className="muted">{x.due_status}</div>
                    </td>
                    <td>
                      <form action={updateDocument} className="no-print" style={{ minWidth: 220 }}>
                        <Hidden planId={id} tab={`documents&f=${f}`} />
                        <input type="hidden" name="id" value={x.document_id} />
                        <select name="status" defaultValue={x.status}>{DOC_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                        <input name="file_link" defaultValue={x.file_link ?? ''} placeholder="Link to the document" />
                        <button className="secondary" style={{ marginTop: 6 }}>Save</button>
                      </form>
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        )}
      </>
    );
  }

  function Details() {
    const can = lvl >= 4;
    const F = ({ name, label, type = 'text', ...rest }) => (
      <label>{label}<input type={type} name={name} defaultValue={plan[name] ?? ''} disabled={!can} {...rest} /></label>
    );
    const T = ({ name, label }) => <label>{label}<textarea name={name} rows={4} defaultValue={plan[name] ?? ''} disabled={!can} /></label>;
    const total = (Number(plan.max_staffing) || 0) + (Number(plan.max_facility) || 0) + (Number(plan.max_supplemental) || 0);
    return (
      <form action={updatePlan} className="card">
        <Hidden planId={id} tab="details" />
        {!can && <p className="muted small">Only a Director of Operations or above can change plan details.</p>}
        <h2>Information</h2>
        <div className="row"><F name="care_setting_name" label="Name of the care setting" /><F name="care_setting_address" label="Address of the care setting" /></div>
        <div className="row"><F name="cfr_number" label="CFR number" /><F name="contract_number" label="Contract number (after signing)" /><F name="contract_effective_date" label="Contract effective date" type="date" /></div>
        <div className="row"><F name="opening_date" label="Opening date (first youth arrives)" type="date" /><F name="submitted_by" label="Submitted by" /><F name="submission_date" label="Submission date" type="date" /></div>
        <div className="row">
          <label>Status<select name="status" defaultValue={plan.status} disabled={!can}>{PLAN_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <F name="transition_days" label="Transition-In period (days, 90 or less)" type="number" min="1" max="90" />
        </div>
        <h2>Overview</h2>
        <T name="goals" label="Goals" /><T name="assumptions" label="Assumptions" /><T name="risks" label="Risks" /><T name="risk_actions" label="Actions (to treat risk)" /><T name="other_notes" label="Other" />
        <h2>Transition payment</h2>
        <div className="row">
          <F name="max_staffing" label="Maximum for staffing costs ($)" type="number" step="0.01" />
          <F name="max_facility" label="Maximum for facility costs ($)" type="number" step="0.01" />
          <F name="max_supplemental" label="Maximum for supplemental supports ($)" type="number" step="0.01" />
        </div>
        <p className="small">Total proposed Transition Payment Maximum: <strong>${total.toLocaleString('en-CA')}</strong></p>
        <label>Preferred payment structure<select name="payment_option" defaultValue={plan.payment_option ?? ''} disabled={!can}>
          <option value="">—</option><option>Option 1</option><option>Option 2</option></select></label>
        <p className="muted small">Option 1: instalments (effective date, end of month 1, end of month 2, remaining actual costs). Option 2: paid on completion of the Transition-In Services.</p>
        {can && <button>Save plan</button>}
      </form>
    );
  }
}
