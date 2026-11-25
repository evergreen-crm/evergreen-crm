// One legacy transition-in plan: plan details (Director+) and the obligations by stage (Program Manager+ can tick off).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import { updateLegacyPlan, updateLegacyObligation } from '../actions';
import { plainError } from '@/lib/plain';

const STAGES = ['30-day', '60-day', '90-day updates', '12-month'];
const STATUSES = ['Draft', 'Submitted to Director', 'Approved', 'Signed', 'Term complete'];
const SERVICE_TYPES = ['Specialized Long-Term Care', 'Low-Barrier Short-Term Stabilization Care', 'Respite Care', 'Emergency Care'];

export default async function LegacyPlan({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const canEditPlan = levelOf(profile) >= 4;
  const { data: plan } = await supabase.from('legacy_plans').select('*').eq('id', id).maybeSingle();
  if (!plan) notFound();
  const { data: obs } = await supabase.from('legacy_obligations').select('*').eq('plan_id', id).order('sort');
  const done = (obs ?? []).filter((o) => o.status === 'Achieved').length;

  return (
    <main>
      <p className="small"><Link href="/legacy">← All legacy transition plans</Link></p>
      <h1>{plan.care_setting_name ?? 'Care setting TBD'}</h1>
      <p className="muted">{plan.shss_service_type ?? 'Service type TBD'} · {plan.status} · {done} of {(obs ?? []).length} obligations achieved</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{plainError(sp.error)}</p>}

      <details className="card no-print" open={!plan.effective_date}>
        <summary><strong>Plan details</strong>{!canEditPlan && <span className="muted small"> (view only: Director of Operations or above can change these)</span>}</summary>
        <form action={updateLegacyPlan} className="grid2" style={{ marginTop: 12 }}>
          <input type="hidden" name="plan_id" value={plan.id} />
          <label>Service provider name<input name="service_provider_name" defaultValue={plan.service_provider_name ?? ''} disabled={!canEditPlan} /></label>
          <label>Care setting name<input name="care_setting_name" defaultValue={plan.care_setting_name ?? ''} disabled={!canEditPlan} /></label>
          <label>Address of the care setting<input name="care_setting_address" defaultValue={plan.care_setting_address ?? ''} disabled={!canEditPlan} /></label>
          <label>SHSS service type
            <select name="shss_service_type" defaultValue={plan.shss_service_type ?? ''} disabled={!canEditPlan}>
              <option value="">Choose later</option>
              {SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Agreement number<input name="agreement_number" defaultValue={plan.agreement_number ?? ''} disabled={!canEditPlan} /></label>
          <label>Effective date of agreement<input type="date" name="effective_date" defaultValue={plan.effective_date ?? ''} disabled={!canEditPlan} /></label>
          <label>Term ends (set automatically: 12 months)<input value={plan.term_end_date ? fmtDate(plan.term_end_date) : 'Set the effective date'} disabled /></label>
          <label>Plan submitted on<input type="date" name="plan_submitted_on" defaultValue={plan.plan_submitted_on ?? ''} disabled={!canEditPlan} /></label>
          <label>Submitted by<input name="submitted_by" defaultValue={plan.submitted_by ?? ''} disabled={!canEditPlan} /></label>
          <label>First draft sent to Director (within 2 weeks)<input type="date" name="first_draft_on" defaultValue={plan.first_draft_on ?? ''} disabled={!canEditPlan} /></label>
          <label>30-day review meeting<input type="date" name="thirty_day_review_on" defaultValue={plan.thirty_day_review_on ?? ''} disabled={!canEditPlan} /></label>
          <label>Plan approved by Director (within 60 days)<input type="date" name="plan_approved_on" defaultValue={plan.plan_approved_on ?? ''} disabled={!canEditPlan} /></label>
          <label>Initial 90-day status update due<input type="date" name="initial_90_update_due" defaultValue={plan.initial_90_update_due ?? ''} disabled={!canEditPlan} /></label>
          <label>Status<select name="status" defaultValue={plan.status} disabled={!canEditPlan}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Source documents<input name="source_documents" defaultValue={plan.source_documents ?? ''} disabled={!canEditPlan} /></label>
          <label style={{ gridColumn: '1 / -1' }}>Notes<textarea name="notes" rows={3} defaultValue={plan.notes ?? ''} disabled={!canEditPlan} /></label>
          {canEditPlan && <div style={{ gridColumn: '1 / -1' }}><button type="submit">Save plan details</button></div>}
        </form>
      </details>

      {STAGES.map((stage) => (
        <section key={stage}>
          <h2>{stage === '30-day' ? '30-day obligations' : stage === '60-day' ? '60-day obligation' : stage === '90-day updates' ? '90-day updates (repeat every 90 days)' : '12-month obligations'}</h2>
          {(obs ?? []).filter((o) => o.stage === stage).map((o) => (
            <form key={o.id} action={updateLegacyObligation} className="card" style={{ marginBottom: 10 }}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="plan_id" value={plan.id} />
              <p style={{ margin: '0 0 6px' }}><strong>{o.sort}.</strong> {o.obligation}</p>
              {o.reference && <p className="muted small" style={{ margin: '0 0 8px' }}>Reference: {o.reference}</p>}
              <div className="grid2">
                <label>Status
                  <select name="status" defaultValue={o.status}>
                    <option>In Progress</option>
                    <option>Achieved</option>
                  </select>
                </label>
                <label>Date achieved<input type="date" name="achieved_on" defaultValue={o.achieved_on ?? ''} /></label>
                <label style={{ gridColumn: '1 / -1' }}>Action plan (required while In Progress: steps, owner, 90-day target dates)
                  <textarea name="action_plan" rows={2} defaultValue={o.action_plan ?? ''} />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Director feedback and meeting notes<textarea name="director_feedback" rows={2} defaultValue={o.director_feedback ?? ''} /></label>
              </div>
              <div style={{ marginTop: 8 }}><button type="submit">Save</button></div>
            </form>
          ))}
        </section>
      ))}
    </main>
  );
}
