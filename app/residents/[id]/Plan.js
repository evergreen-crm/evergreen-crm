// "Plan" tab (Phase 3): the person-centred plan (CLBC adults) or plan of care (MCFD children and youth).
// Review and due dates create reminder tasks automatically; sign-off, consent, the progress view,
// the plan log and the monthly progress summary (shift notes linked to goals) are all here.
import Link from 'next/link';
import { fmtDate, todayISO } from '@/lib/options';
import { areasFor, streamOf, PLAN_NAME, MCFD_DUE, CLBC_DUE, LOG_KINDS, logKindsFor, AGREED_HOW, SUPPORT_LEVELS, dueState } from '@/lib/plans';
import { savePlan, addPlanLog } from '@/app/residents/planActions';
import PrintButton from '@/app/PrintButton';

const D = ({ name, label, value }) => <label>{label}<input type="date" name={name} defaultValue={value ?? ''} /></label>;

export default async function Plan({ supabase, resident, canEdit, isStaff, month }) {
  const today = todayISO();
  const ym = /^\d{4}-\d{2}$/.test(month ?? '') ? month : today.slice(0, 7);
  const from = `${ym}-01`;
  const to = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10);
  const [{ data: plan, error }, { data: goals }, { data: log }, { data: notes }, { data: progress }, { count: consents }] = await Promise.all([
    supabase.from('care_plans').select('*').eq('resident_id', resident.id).maybeSingle(),
    supabase.from('goals').select('id, title, domain, status').eq('resident_id', resident.id).order('created_at'),
    supabase.from('plan_log').select('*, by:by_profile_id(full_name)').eq('resident_id', resident.id).order('on_date', { ascending: false }).limit(200),
    supabase.from('shift_notes').select('id, note_date, shift, note, goal_ids').eq('resident_id', resident.id).gte('note_date', from).lte('note_date', to).not('signed_at', 'is', null),
    supabase.from('entries').select('id, entry_date, data').eq('resident_id', resident.id).eq('kind', 'goal_progress').gte('entry_date', from).lte('entry_date', to),
    supabase.from('resident_consents').select('id', { count: 'exact', head: true }).eq('resident_id', resident.id).gte('expires_on', today),
  ]);
  if (error && /relation|schema/i.test(error.message)) return <p className="message">The plan module is not installed yet (Phase 3 SQL).</p>;

  const stream = plan?.stream ?? streamOf(resident);
  const areas = areasFor(stream);
  const name = resident.preferred_name || resident.first_name;
  const active = (goals ?? []).filter((g) => g.status === 'Active');
  const path = `/residents/${resident.id}?tab=plan`;

  if (!plan) {
    return (
      <section>
        <p className="message">{name} has no {PLAN_NAME[stream].toLowerCase()} in the CRM yet. A task is created for the Program Coordinator if there is still no plan 30 days after admission.</p>
        {canEdit ? (
          <form action={savePlan} className="card">
            <h2 style={{ marginTop: 0 }}>Start the {PLAN_NAME[stream].toLowerCase()} ({stream})</h2>
            <input type="hidden" name="resident_id" value={resident.id} /><input type="hidden" name="stream" value={stream} />
            <div className="row"><D name="started_on" label="Plan start date" value={today} />{stream === 'MCFD' && <label>Social worker<input name="sw_name" defaultValue={resident.case_worker_name ?? ''} /></label>}</div>
            <label>{stream === 'CLBC' ? `What matters to ${name} (in their own words)` : `What ${name} wants (in their own words)`}<textarea name="what_matters" rows={3} /></label>
            <p className="small muted">The first full review is set 6 months from the start date{stream === 'CLBC' ? ', and the yearly CLBC facilitator review 12 months from it' : ''}. You can change the dates after saving.</p>
            <button>Start plan</button>
          </form>
        ) : <p className="muted">A Program Coordinator (level 2) or above starts the plan.</p>}
      </section>
    );
  }

  const dueRows = stream === 'MCFD' ? MCFD_DUE : CLBC_DUE;
  const byArea = Object.fromEntries(areas.map((a) => [a, { active: 0, achieved: 0 }]));
  for (const g of goals ?? []) {
    if (!byArea[g.domain] || g.status === 'Discontinued') continue;
    byArea[g.domain][g.status === 'Achieved' ? 'achieved' : 'active'] += 1;
  }
  const untagged = active.filter((g) => !areas.includes(g.domain));
  const max = Math.max(1, ...Object.values(byArea).map((v) => v.active + v.achieved));
  const monthLog = (log ?? []).filter((l) => l.on_date >= from && l.on_date <= to);
  const hours = (k) => monthLog.filter((l) => l.kind === k).reduce((s, l) => s + Number(l.hours ?? 0), 0);
  const checkinState = stream === 'CLBC' ? (plan.last_checkin_on && plan.last_checkin_on >= from ? null : 'No monthly check-in recorded this month yet.') : null;
  const prevMonth = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
  const nextMonth = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 1)).toISOString().slice(0, 7);

  return (
    <section>
      <div className="card">
        <div className="title-row"><h2 style={{ margin: 0 }}>{PLAN_NAME[stream]} · {stream}</h2><span className="no-print"><PrintButton /></span></div>
        <p className="small muted">Started {fmtDate(plan.started_on)} · Last review {plan.last_review_on ? fmtDate(plan.last_review_on) : 'none yet'} · Next review {fmtDate(plan.next_review_on)}{stream === 'CLBC' ? ` · Last check-in ${plan.last_checkin_on ? fmtDate(plan.last_checkin_on) : 'none yet'}` : ''}</p>
        {checkinState && <p className="message small">{checkinState}</p>}
        {plan.what_matters && <><h3 className="small">What matters to {name}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{plan.what_matters}</p></>}
        {plan.strengths && <><h3 className="small">Strengths</h3><p style={{ whiteSpace: 'pre-wrap' }}>{plan.strengths}</p></>}
        {plan.how_to_support && <><h3 className="small">How to support {name}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{plan.how_to_support}</p></>}
      </div>

      <h2>{stream === 'MCFD' ? 'Due dates' : 'Reviews'}</h2>
      <table className="small"><thead><tr><th>What</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>{dueRows.map(([f, label]) => { const s = dueState(plan[f], today); return (
          <tr key={f}><td>{label}</td><td>{plan[f] ? fmtDate(plan[f]) : '—'}</td><td><span className={`badge ${s.cls}`}>{s.text}</span></td></tr>); })}</tbody></table>
      <p className="small muted">The CRM creates a task for the right level before each date and moves it up a level if it goes overdue. Changing a date (after the appointment or review) closes the old task.</p>

      <h2>{stream === 'CLBC' ? 'Goals across the eight quality-of-life areas' : 'Goals by plan of care domain'}</h2>
      <div className="small" style={{ display: 'grid', gap: 4 }}>
        {areas.map((a) => { const v = byArea[a]; const n = v.active + v.achieved; return (
          <div key={a} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 200px) 1fr auto', gap: 8, alignItems: 'center' }}>
            <span>{a}</span>
            <span style={{ background: 'var(--line, #ddd)', borderRadius: 4, height: 12, overflow: 'hidden', display: 'flex' }}>
              <span style={{ width: `${(v.achieved / max) * 100}%`, background: 'var(--ok, #2e7d32)' }} />
              <span style={{ width: `${(v.active / max) * 100}%`, background: 'var(--accent, #1565c0)' }} />
            </span>
            {n ? <span>{v.active} active · {v.achieved} achieved</span> : <span className="badge warn">Gap: no goal</span>}
          </div>); })}
      </div>
      {untagged.length > 0 && <p className="small muted">{untagged.length} active goal{untagged.length === 1 ? ' has' : 's have'} no {stream === 'CLBC' ? 'quality-of-life area' : 'domain'}: {untagged.map((g) => g.title).join(', ')}. Set it on the <Link href={`/residents/${resident.id}?tab=goals`}>Goals tab</Link>.</p>}

      <h2>Sign-off and consent</h2>
      <div className="card small">
        <p>{name}: {plan.person_agreed_on ? <>agreed {fmtDate(plan.person_agreed_on)}{plan.person_agreed_how ? ` (${plan.person_agreed_how})` : ''}</> : <span className="badge warn">Not yet</span>}</p>
        {(plan.rep_name || stream === 'CLBC') && <p>Representative: {plan.rep_name ? <>{plan.rep_name} · {plan.rep_signed_on ? `signed ${fmtDate(plan.rep_signed_on)}` : <span className="badge warn">Not signed</span>}</> : 'none'}</p>}
        {stream === 'MCFD' && <p>Social worker: {plan.sw_name ?? '—'} · {plan.sw_signed_on ? `co-signed ${fmtDate(plan.sw_signed_on)}` : <span className="badge warn">Not co-signed</span>}{isStaff && !plan.sw_signed_on && <> · <Link href="/sign/new">Send the printed plan for e-signature →</Link></>}</p>}
        <p>{stream === 'CLBC'
          ? <>Supported decision-making: {plan.supported_decision_making ? 'yes' : 'no'} · Representation Agreement on file: {plan.representation_agreement ? 'yes' : 'no'}</>
          : <>Guardian consent on file: {plan.guardian_consent ? 'yes' : <span className="badge warn">no</span>}</>} · Current consents: {consents ?? 0} (<Link href={`/residents/${resident.id}?tab=consents`}>Consents tab</Link>)</p>
      </div>

      {canEdit && (
        <details className="card no-print">
          <summary><strong>Edit the plan, record a review or update dates</strong></summary>
          <form action={savePlan} className="stack">
            <input type="hidden" name="resident_id" value={resident.id} /><input type="hidden" name="booleans" value="1" />
            <label>What matters to {name} (their own words)<textarea name="what_matters" rows={3} defaultValue={plan.what_matters ?? ''} /></label>
            <label>Strengths<textarea name="strengths" rows={2} defaultValue={plan.strengths ?? ''} /></label>
            <label>How to support {name}<textarea name="how_to_support" rows={3} defaultValue={plan.how_to_support ?? ''} /></label>
            <div className="row"><D name="last_review_on" label="Review held on (sets the next review 6 months later)" value={plan.last_review_on} /><D name="next_review_on" label="Next review" value={plan.next_review_on} />{stream === 'CLBC' && <D name="facilitator_review_on" label="CLBC facilitator review" value={plan.facilitator_review_on} />}</div>
            {stream === 'MCFD' && <div className="row"><D name="iep_due_on" label="IEP" value={plan.iep_due_on} /><D name="medical_due_on" label="Medical" value={plan.medical_due_on} /><D name="dental_due_on" label="Dental" value={plan.dental_due_on} /><D name="eye_due_on" label="Eye exam" value={plan.eye_due_on} /><D name="rights_review_due_on" label="Rights review" value={plan.rights_review_due_on} /></div>}
            <div className="row">
              <D name="person_agreed_on" label={`${name} agreed on`} value={plan.person_agreed_on} />
              <label>How<select name="person_agreed_how" defaultValue={plan.person_agreed_how ?? ''}><option value="">—</option>{AGREED_HOW.map((h) => <option key={h}>{h}</option>)}</select></label>
              <label>Representative<input name="rep_name" defaultValue={plan.rep_name ?? ''} /></label><D name="rep_signed_on" label="Representative signed" value={plan.rep_signed_on} />
            </div>
            {stream === 'MCFD' && <div className="row"><label>Social worker<input name="sw_name" defaultValue={plan.sw_name ?? resident.case_worker_name ?? ''} /></label><label>Social worker email<input type="email" name="sw_email" defaultValue={plan.sw_email ?? resident.case_worker_email ?? ''} /></label><D name="sw_signed_on" label="Social worker co-signed" value={plan.sw_signed_on} /></div>}
            {stream === 'CLBC'
              ? <><label className="inline"><input type="checkbox" name="supported_decision_making" defaultChecked={plan.supported_decision_making} /> Supported decision-making in place</label><label className="inline"><input type="checkbox" name="representation_agreement" defaultChecked={plan.representation_agreement} /> Representation Agreement on file</label></>
              : <label className="inline"><input type="checkbox" name="guardian_consent" defaultChecked={plan.guardian_consent} /> Guardian consent on file</label>}
            <button>Save plan</button>
          </form>
        </details>
      )}

      <h2>Plan log</h2>
      {isStaff && (
        <form action={addPlanLog} className="card no-print">
          <input type="hidden" name="resident_id" value={resident.id} />
          <div className="row">
            <label>What<select name="kind" required defaultValue="">{[['', 'Choose…'], ...logKindsFor(stream).map(([k, v]) => [k, v.label])].map(([k, l]) => <option key={k} value={k} disabled={!k}>{l}</option>)}</select></label>
            <D name="on_date" label="Date" value={today} />
            <label>Hours (if any)<input type="number" name="hours" min="0" max="24" step="0.25" /></label>
            <label>With whom<input name="with_whom" maxLength={200} /></label>
          </div>
          <label>Note (what happened, what {name} said)<input name="note" maxLength={4000} /></label>
          <button className="secondary">Record</button>
        </form>
      )}
      {(log ?? []).length === 0 ? <p className="muted small">Nothing recorded yet.</p> : (
        <ul className="small">{(log ?? []).slice(0, 15).map((l) => <li key={l.id}><strong>{fmtDate(l.on_date)}</strong> · {LOG_KINDS[l.kind]?.label ?? l.kind}{l.hours ? ` · ${l.hours} h` : ''}{l.with_whom ? ` · with ${l.with_whom}` : ''}{l.note ? ` — ${l.note}` : ''} <span className="muted">({l.by?.full_name ?? '—'})</span></li>)}</ul>
      )}

      <h2 className="page-break">Monthly progress summary · {new Date(`${from}T12:00:00`).toLocaleString('en-CA', { month: 'long', year: 'numeric' })}</h2>
      <p className="small no-print"><Link href={`${path}&month=${prevMonth}`}>← Previous month</Link>{ym < today.slice(0, 7) && <> · <Link href={`${path}&month=${nextMonth}`}>Next month →</Link></>}</p>
      <table className="small"><thead><tr><th>Goal</th><th>Shift notes linked</th><th>Progress records</th><th>Support level (most recent)</th></tr></thead>
        <tbody>{active.length === 0 ? <tr><td colSpan={4} className="muted">No active goals.</td></tr> : active.map((g) => {
          const n = (notes ?? []).filter((x) => (x.goal_ids ?? []).includes(g.id));
          const p = (progress ?? []).filter((x) => x.data?.goal_id === g.id).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
          const counts = SUPPORT_LEVELS.map((s) => [s, p.filter((x) => x.data?.level === s).length]).filter(([, c]) => c);
          return <tr key={g.id}><td>{g.title}{g.domain ? <div className="muted">{g.domain}</div> : null}</td><td>{n.length}</td><td>{p.length}{counts.length ? <div className="muted">{counts.map(([s, c]) => `${s}: ${c}`).join(' · ')}</div> : null}</td><td>{p[0]?.data?.level ?? '—'}</td></tr>;
        })}</tbody></table>
      <p className="small">
        {stream === 'CLBC'
          ? <>Monthly check-ins: {monthLog.filter((l) => l.kind === 'checkin').length} · Natural-support hours (no paid staff): {hours('natural_support')} · Cultural connection hours: {hours('cultural_connection')}</>
          : <>Family visits: {monthLog.filter((l) => l.kind === 'family_visit').length} ({hours('family_visit')} h) · Cultural connections: {monthLog.filter((l) => l.kind === 'cultural_connection').length} · Rights reviews: {monthLog.filter((l) => l.kind === 'rights_review').length}</>}
        {' '}· Signed shift notes this month: {(notes ?? []).length} ({(notes ?? []).filter((x) => (x.goal_ids ?? []).length).length} linked to a goal)
      </p>
    </section>
  );
}
