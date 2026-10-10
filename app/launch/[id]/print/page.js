// Printable launch plan report. Choose what to include, then print or "Save as PDF".
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { fmtDate, todayISO, addDaysISO } from '@/lib/options';
import PrintButton from '@/app/PrintButton';

const SECTIONS = [
  { key: 'info', label: 'Plan information & overview' },
  { key: 'payment', label: 'Transition payment' },
  { key: 'milestones', label: 'Milestones & tasks (with tick boxes)' },
  { key: 'documents', label: 'Documents before opening' },
  { key: 'signoff', label: 'Sign-off lines' },
];
const DONE = ['Approved', 'Submitted to MCFD', 'Not applicable'];

export default async function PrintPlan({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const { data: plan } = await supabase.from('launch_plans').select('*').eq('id', id).maybeSingle();
  if (!plan) notFound();

  // Default: everything. After the options form is used, only the ticked sections.
  const chosen = sp.go ? new Set(SECTIONS.map((s) => s.key).filter((k) => sp[k])) : new Set(SECTIONS.map((s) => s.key));
  const docFilter = ['all', 'todo', 'required'].includes(sp.docs) ? sp.docs : 'all';
  const blank = sp.blank === '1'; // blank tick boxes (for working on paper)

  const [{ data: milestones }, { data: docs }] = await Promise.all([
    supabase.from('launch_milestones').select('*').eq('plan_id', id).order('number'),
    supabase.from('launch_documents_due').select('*').eq('plan_id', id).order('sort'),
  ]);
  const { data: tasks } = await supabase.from('launch_tasks').select('*')
    .in('milestone_id', (milestones ?? []).map((m) => m.id)).order('sort');
  const byMs = {};
  for (const t of tasks ?? []) (byMs[t.milestone_id] ??= []).push(t);
  const docRows = (docs ?? []).filter((x) => docFilter === 'all' ? true : docFilter === 'required' ? x.requirement !== 'Best practice' : !DONE.includes(x.status));
  const reqDone = (docs ?? []).filter((x) => x.requirement !== 'Best practice' && DONE.includes(x.status)).length;
  const reqTotal = (docs ?? []).filter((x) => x.requirement !== 'Best practice').length;
  const total = (Number(plan.max_staffing) || 0) + (Number(plan.max_facility) || 0) + (Number(plan.max_supplemental) || 0);
  const box = (done) => (blank ? '☐' : done ? '☑' : '☐');

  return (
    <main className="report">
      <p className="small no-print"><Link href={`/launch/${id}`}>← Back to the plan</Link></p>

      <form className="card no-print" method="get">
        <input type="hidden" name="go" value="1" />
        <h2 style={{ marginTop: 0 }}>🖨 Print options</h2>
        <div className="row">
          <div>
            <strong className="small">Include</strong>
            {SECTIONS.map((s) => (
              <label key={s.key} className="check"><input type="checkbox" name={s.key} value="1" defaultChecked={chosen.has(s.key)} /> {s.label}</label>
            ))}
          </div>
          <div>
            <label>Documents to list
              <select name="docs" defaultValue={docFilter}>
                <option value="all">All documents</option>
                <option value="todo">Only ones still to do</option>
                <option value="required">Only MCFD & legal</option>
              </select>
            </label>
            <label className="check"><input type="checkbox" name="blank" value="1" defaultChecked={blank} /> Blank tick boxes (to fill in by hand)</label>
          </div>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="secondary">Update preview</button>
          <PrintButton label="🖨 Print / Save as PDF" />
        </div>
        <p className="muted small">Tip: to make a PDF, choose “Save as PDF” as the printer.</p>
      </form>

      <div style={{ marginBottom: 12 }}>
        <h1 style={{ marginBottom: 4 }}>Transition-In Plan — {plan.care_setting_name ?? 'Care setting TBD'}</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Evergreen Community Care · {plan.service_type} · Status: <strong>{plan.status}</strong>
          {' · '}Opening: <strong>{plan.opening_date ? fmtDate(plan.opening_date) : 'not set'}</strong>
          {' · '}MCFD &amp; legal documents done: <strong>{reqDone}/{reqTotal}</strong>
          {' · '}Printed {fmtDate(todayISO())} by {profile.full_name}
        </p>
      </div>

      {chosen.has('info') && (
        <section className="card" style={{ breakInside: 'auto' }}>
          <h2>Plan information</h2>
          <dl className="facts">
            <dt>Agency</dt><dd>Evergreen Community Care</dd>
            <dt>SHSS service type</dt><dd>{plan.service_type}</dd>
            <dt>Care setting</dt><dd>{plan.care_setting_name ?? 'TBD'}</dd>
            <dt>Address</dt><dd>{plan.care_setting_address ?? '—'}</dd>
            <dt>CFR number</dt><dd>{plan.cfr_number ?? '—'}</dd>
            <dt>Contract number</dt><dd>{plan.contract_number ?? '— (after signing)'}</dd>
            <dt>Contract effective date</dt><dd>{plan.contract_effective_date ? fmtDate(plan.contract_effective_date) : '—'}</dd>
            <dt>Opening date</dt><dd>{plan.opening_date ? fmtDate(plan.opening_date) : '—'}</dd>
            <dt>Submitted by</dt><dd>{plan.submitted_by ?? '—'}{plan.submission_date ? ` · ${fmtDate(plan.submission_date)}` : ''}</dd>
            <dt>Transition-In period</dt><dd>{plan.transition_days ? `${plan.transition_days} days` : '—'}</dd>
          </dl>
          {[['Goals', plan.goals], ['Assumptions', plan.assumptions], ['Risks', plan.risks], ['Actions (to treat risk)', plan.risk_actions], ['Other', plan.other_notes]]
            .filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={{ marginTop: 10 }}><strong>{k}</strong><p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{v}</p></div>
            ))}
        </section>
      )}

      {chosen.has('payment') && (
        <section className="card">
          <h2>Transition payment</h2>
          <table>
            <tbody>
              <tr><td>Maximum for staffing costs</td><td>${(Number(plan.max_staffing) || 0).toLocaleString('en-CA')}</td></tr>
              <tr><td>Maximum for facility costs</td><td>${(Number(plan.max_facility) || 0).toLocaleString('en-CA')}</td></tr>
              <tr><td>Maximum for supplemental supports</td><td>${(Number(plan.max_supplemental) || 0).toLocaleString('en-CA')}</td></tr>
              <tr><td><strong>Total proposed Transition Payment Maximum</strong></td><td><strong>${total.toLocaleString('en-CA')}</strong></td></tr>
              <tr><td>Preferred payment structure</td><td>{plan.payment_option ?? '—'}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      {chosen.has('milestones') && (
        <section>
          <h2>Milestones</h2>
          {(milestones ?? []).map((m) => {
            const target = plan.contract_effective_date && m.proposed_days ? addDaysISO(plan.contract_effective_date, m.proposed_days) : null;
            return (
              <div key={m.id} className="card" style={{ breakInside: 'auto', padding: 10 }}>
                <h3 style={{ margin: 0 }}>{box(m.completed_on)} Milestone {m.number}: {m.title}</h3>
                <p className="small muted" style={{ margin: '4px 0' }}>
                  Proposed: {m.proposed_days ? `${m.proposed_days} days` : 'not set'}
                  {target && ` · target ${fmtDate(target)}`}
                  {' · '}Actual completion: {!blank && m.completed_on ? fmtDate(m.completed_on) : '________________'}
                </p>
                {m.deliverable && <p className="small" style={{ margin: '4px 0' }}><strong>Deliverable:</strong> {m.deliverable}</p>}
                <table style={{ breakInside: 'auto' }}>
                  <tbody>
                    {(byMs[m.id] ?? []).map((t) => t.is_heading ? (
                      <tr key={t.id}><td colSpan={3}><strong className="small">{t.task}</strong></td></tr>
                    ) : (
                      <tr key={t.id}>
                        <td style={{ width: 28 }}>{box(t.completed_on)}</td>
                        <td className="small">{t.task}</td>
                        <td className="small" style={{ width: 150 }}>{!blank && t.completed_on ? fmtDate(t.completed_on) : 'Date: __________'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>
      )}

      {chosen.has('documents') && (
        <section className="page-break">
          <h2>Documents before opening{docFilter === 'todo' ? ' — still to do' : docFilter === 'required' ? ' — MCFD & legal' : ''}</h2>
          <table style={{ breakInside: 'auto' }}>
            <thead><tr><th></th><th>Document</th><th>Type</th><th>Owner</th><th>Due</th><th>Status</th><th>File</th></tr></thead>
            <tbody>
              {docRows.map((x) => (
                <tr key={x.document_id}>
                  <td>{box(DONE.includes(x.status))}</td>
                  <td className="small">{x.document}<div className="muted">{x.category}</div></td>
                  <td className="small">{x.requirement === 'MCFD required' ? 'MCFD' : x.requirement === 'Legal requirement' ? 'Legal' : 'Best practice'}</td>
                  <td className="small">{x.owner_role}</td>
                  <td className="small">{x.due_date ? fmtDate(x.due_date) : x.due_status === 'Contract-dated' ? 'Contract date' : '—'}</td>
                  <td className="small">{blank ? '' : x.status}</td>
                  <td className="small">{x.file_name ? `📎 ${x.file_name}` : x.file_link ? 'Link' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {docRows.length === 0 && <p className="muted">Nothing to list.</p>}
        </section>
      )}

      {chosen.has('signoff') && (
        <section className="card" style={{ breakInside: 'avoid' }}>
          <h2>Sign-off</h2>
          <table>
            <thead><tr><th>Role</th><th>Name</th><th>Signature</th><th>Date</th></tr></thead>
            <tbody>
              {['Prepared by', 'Program Manager', 'Director of Operations', 'Executive Director', 'CEO'].map((r) => (
                <tr key={r} style={{ height: 44 }}><td>{r}</td><td></td><td></td><td></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
