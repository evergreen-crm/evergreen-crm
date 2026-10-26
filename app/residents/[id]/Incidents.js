// "Incidents" tab: incident and critical incident reports with reporting deadlines.
import { INCIDENT_TYPES } from '@/lib/requirements';
import { fmtDate, fmtTime, todayISO, TZ } from '@/lib/options';
import { addIncident, updateIncident } from '@/app/residents/actions';
import { writtenDue, reviewDue, INCIDENT_CLASSES, countdown, FORM_NAME } from '@/lib/incidents';
import Link from 'next/link';
import { plainError } from '@/lib/plain';

// ✋ Restraint / restricted practice: the steps that must be done before the incident can be closed.
const isRestraint = (i) => i.physical_intervention || /^Restricted practice|^Physical intervention/.test(i.incident_type ?? '');


export default async function Incidents({ supabase, resident, program, cls, openNew, msg = {}, lead = false }) {
  let q = supabase.from('incidents').select('*, profiles:reported_by(full_name)').eq('resident_id', resident.id);
  if (cls) q = q.eq('incident_class', cls);
  const { data: incidents } = await q.order('occurred_on', { ascending: false });
  const base = `/residents/${resident.id}?tab=incidents`;
  const today = todayISO();
  const who = program === 'clbc' ? 'CLBC liaison analyst' : 'MCFD social worker';

  return (
    <section>
      {msg.ok && <p className="message ok no-print">{msg.ok}</p>}
      {msg.error && <p className="message error no-print">{plainError(msg.error)}</p>}
      <div className="pills no-print">
        <Link href={base} className={!cls ? 'on' : ''}>All</Link>
        {INCIDENT_CLASSES.map((c) => <Link key={c.key} href={`${base}&class=${c.key}`} className={cls === c.key ? 'on' : ''}>{c.key}</Link>)}
      </div>
      <details className="card no-print" open={openNew || (incidents?.length === 0 && !cls)} id="new-incident">
        <summary><strong>+ Report an incident</strong></summary>
        <form action={addIncident} className="stack">
          <input type="hidden" name="resident_id" value={resident.id} />
          <input type="hidden" name="home_id" value={resident.home_id} />
          <div className="row">
            <label>Date<input type="date" name="occurred_on" required defaultValue={today} /></label>
            <label>Time<input type="time" name="occurred_time" defaultValue={openNew ? new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : undefined} /></label>
            <label>
              Type
              <select name="incident_type" required defaultValue="">
                <option value="" disabled>Pick a type</option>
                {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="card">
            <legend>Kind of incident</legend>
            {INCIDENT_CLASSES.map((c, i) => (
              <label key={c.key} className="check"><input type="radio" name="incident_class" value={c.key} defaultChecked={i === 0} /> {c.label}</label>
            ))}
          </fieldset>
          <label>A — What happened before (trigger / setting)<textarea name="antecedent" rows={2} /></label>
          <label>B — What happened (the incident or behaviour)<textarea name="description" rows={4} required /></label>
          <label>C — What happened after<textarea name="consequence" rows={2} /></label>
          <label>Support / de-escalation used<textarea name="intervention" rows={2} /></label>
          <div className="row">
            <label>How long (minutes)<input type="number" min="0" name="duration_minutes" /></label>
            <label>Injuries (anyone)<input name="injuries" placeholder="None, or describe" /></label>
          </div>
          <label className="check"><input type="checkbox" name="physical_intervention" /> Physical intervention / restraint used (always a critical incident)</label>
          <fieldset className="card rst-fields">
            <legend>✋ Restraint or restricted practice</legend>
            <p className="small muted" style={{ marginTop: 0 }}>Only to stop immediate harm, by staff with current NVCI, for the shortest time. Leaders are alerted when you save.</p>
            <label>What did you try first? ⭐ (calm talk, space, choices, the plan’s strategies)<textarea name="tried_first" rows={2} /></label>
            <div className="row">
              <label>Hold or method used<input name="hold_used" placeholder="For example: NVCI escort" /></label>
              <label>Staff involved and witnesses<input name="staff_involved" /></label>
            </div>
            <label className="check"><input type="checkbox" name="no_prohibited" /> ⭐ I confirm <strong>no</strong> prone (face-down) hold, no pressure on the neck, chest or back, no mechanical or chemical restraint, and no seclusion</label>
            {program === 'clbc' && (
              <label>Is this in the person’s approved behaviour support or safety plan?
                <select name="in_safety_plan" defaultValue=""><option value="">Not sure</option><option value="yes">Yes</option><option value="no">No (emergency)</option></select>
              </label>
            )}
          </fieldset>
          <label>Actions taken / follow-up<textarea name="actions_taken" rows={2} /></label>
          <label className="check"><input type="checkbox" name="is_urgent" /> Urgent — phone the {who} immediately (written report within 24 hours)</label>
          <label className="check"><input type="checkbox" name="family_notified" /> Family / guardian notified</label>
          <button>Save incident report</button>
        </form>
      </details>

      {incidents?.length === 0 && <p className="muted">No incidents recorded.</p>}
      {incidents?.map((inc) => {
        const wDue = writtenDue(inc, program);
        const rDue = reviewDue(inc);
        const late = (date, done) => !done && date < today;
        return (
          <article key={inc.id} className={`card incident ${inc.status === 'Closed' ? 'closed' : ''}`}>
            <div className="title-row">
              <h3>{inc.incident_type}</h3>
              <span>
                <span className={`badge ${inc.incident_class === 'Critical' ? 'bad' : 'warn'}`}>{inc.incident_class ?? 'Critical'}</span>{' '}
                {inc.physical_intervention && <span className="badge bad">Physical intervention</span>}{' '}
                {inc.is_urgent && <span className="badge bad">Urgent</span>}{' '}
                <span className={`badge ${inc.status === 'Open' ? 'warn' : ''}`}>{inc.status}</span>
              </span>
            </div>
            <p className="muted small">
              {fmtDate(inc.occurred_on)}{inc.occurred_time && ` · ${fmtTime(inc.occurred_time)}`} · reported by {inc.profiles?.full_name ?? 'staff'}
            </p>
            {inc.antecedent && <p><strong>Before:</strong> {inc.antecedent}</p>}
            <p>{inc.antecedent || inc.consequence ? <strong>What happened: </strong> : null}{inc.description}</p>
            {inc.consequence && <p><strong>After:</strong> {inc.consequence}</p>}
            {inc.intervention && <p><strong>Support used:</strong> {inc.intervention}</p>}
            {(inc.duration_minutes || inc.injuries) && <p className="small">{[inc.duration_minutes && `${inc.duration_minutes} minutes`, inc.injuries && `Injuries: ${inc.injuries}`].filter(Boolean).join(' · ')}</p>}
            {inc.actions_taken && <p><strong>Actions taken:</strong> {inc.actions_taken}</p>}
            {isRestraint(inc) && <AfterRestraint inc={inc} resident={resident} program={program} lead={lead} />}

            {inc.is_critical && (
              <ul className="checklist">
                <li className={inc.verbal_report_at ? 'done' : inc.is_urgent ? 'overdue' : ''}>
                  <div className="req-text"><span className="tick">{inc.verbal_report_at ? '✓' : '○'}</span>
                    <span>Phone the {who}{inc.is_urgent && ' — immediately'}
                      {inc.verbal_report_at && <div className="muted small">Done {new Date(inc.verbal_report_at).toLocaleString('en-CA', { timeZone: TZ })}{inc.verbal_report_to && ` · spoke to ${inc.verbal_report_to}`}</div>}
                    </span></div>
                  {!inc.verbal_report_at && (
                    <form action={updateIncident} className="req-form no-print">
                      <input type="hidden" name="id" value={inc.id} /><input type="hidden" name="resident_id" value={resident.id} />
                      <input type="hidden" name="step" value="verbal" />
                      <input name="verbal_report_to" placeholder="Who you spoke to" />
                      <button className="secondary">Mark called</button>
                    </form>
                  )}
                </li>
                <li className={inc.written_report_sent_on ? 'done' : late(wDue, false) ? 'overdue' : ''}>
                  <div className="req-text"><span className="tick">{inc.written_report_sent_on ? '✓' : '○'}</span>
                    <span>Written report sent to {program === 'clbc' ? 'CLBC' : 'MCFD'} — <Link href={`/incidents/${inc.id}/form`}>📄 {FORM_NAME[inc.form_program ?? program]}</Link>
                      <div className="muted small">{inc.written_report_sent_on ? `Sent ${fmtDate(inc.written_report_sent_on)}${inc.form_sent_to ? ` to ${inc.form_sent_to}` : ''}` : (() => {
                        const cd = countdown(inc.form_due_at);
                        return cd ? <span className={`badge ${cd.tone}`}>⏳ {cd.text}</span> : <>Due {fmtDate(wDue)}{late(wDue, false) && <span className="badge bad"> Overdue</span>}</>;
                      })()}</div>
                    </span></div>
                  {!inc.written_report_sent_on && (
                    <form action={updateIncident} className="req-form no-print">
                      <input type="hidden" name="id" value={inc.id} /><input type="hidden" name="resident_id" value={resident.id} />
                      <input type="hidden" name="step" value="written" />
                      <input type="date" name="date" defaultValue={today} />
                      <button className="secondary">Mark sent</button>
                    </form>
                  )}
                </li>
                <li className={inc.internal_review_on ? 'done' : late(rDue, false) ? 'overdue' : ''}>
                  <div className="req-text"><span className="tick">{inc.internal_review_on ? '✓' : '○'}</span>
                    <span>Internal review (within 5 business days)
                      <div className="muted small">{inc.internal_review_on ? `Done ${fmtDate(inc.internal_review_on)}` : `Due ${fmtDate(rDue)}`}
                        {late(rDue, inc.internal_review_on) && <span className="badge bad">Overdue</span>}</div>
                    </span></div>
                  {!inc.internal_review_on && (
                    <form action={updateIncident} className="req-form no-print">
                      <input type="hidden" name="id" value={inc.id} /><input type="hidden" name="resident_id" value={resident.id} />
                      <input type="hidden" name="step" value="review" />
                      <input type="date" name="date" defaultValue={today} />
                      <button className="secondary">Mark done</button>
                    </form>
                  )}
                </li>
                <li className={inc.family_notified ? 'done' : ''}>
                  <div className="req-text"><span className="tick">{inc.family_notified ? '✓' : '○'}</span><span>Family / guardian notified</span></div>
                  {!inc.family_notified && (
                    <form action={updateIncident} className="req-form no-print">
                      <input type="hidden" name="id" value={inc.id} /><input type="hidden" name="resident_id" value={resident.id} />
                      <input type="hidden" name="step" value="family" />
                      <button className="secondary">Mark notified</button>
                    </form>
                  )}
                </li>
              </ul>
            )}
            <form action={updateIncident} className="no-print">
              <input type="hidden" name="id" value={inc.id} /><input type="hidden" name="resident_id" value={resident.id} />
              <input type="hidden" name="step" value={inc.status === 'Open' ? 'close' : 'reopen'} />
              <button className="link small">{inc.status === 'Open' ? 'Close incident' : 'Reopen'}</button>
            </form>
          </article>
        );
      })}
    </section>
  );
}

function RstStep({ inc, resident, step, done, label, detail, field = 'note', placeholder, canDo = true }) {
  return (
    <li className={done ? 'done' : 'overdue'}>
      <div className="req-text"><span className="tick">{done ? '✓' : '○'}</span>
        <span>{label}{done && <div className="muted small">Done {new Date(done).toLocaleString('en-CA', { timeZone: TZ })}{detail && ` · ${detail}`}</div>}</span></div>
      {!done && canDo && (
        <form action={updateIncident} className="req-form no-print">
          <input type="hidden" name="id" value={inc.id} /><input type="hidden" name="resident_id" value={resident.id} />
          <input type="hidden" name="step" value={step} />
          {placeholder && <input name={field} placeholder={placeholder} required />}
          <button className="secondary">Done</button>
        </form>
      )}
      {!done && !canDo && <span className="muted small">Program Coordinator or Manager</span>}
    </li>
  );
}

function AfterRestraint({ inc, resident, program, lead }) {
  const funder = program === 'clbc' ? 'CLBC told (every restricted practice is a critical incident)' : 'Social worker told right away';
  return (
    <div className="rst-box">
      <h4>✋ Restraint / restricted practice</h4>
      {inc.nvci_flag && <p className="message error small" style={{ margin: '4px 0' }}>⚠️ {inc.nvci_flag} Only staff with current NVCI may use physical intervention.</p>}
      {(inc.tried_first || inc.hold_used || inc.staff_involved) && (
        <p className="small">{inc.tried_first && <><strong>Tried first:</strong> {inc.tried_first}<br /></>}{inc.hold_used && <><strong>Hold / method:</strong> {inc.hold_used}<br /></>}{inc.staff_involved && <><strong>Staff and witnesses:</strong> {inc.staff_involved}</>}
          {inc.in_safety_plan != null && <><br /><strong>In approved plan:</strong> {inc.in_safety_plan ? 'Yes' : 'No (emergency)'}</>}</p>
      )}
      {(!inc.tried_first || !inc.no_prohibited) && inc.status === 'Open' && (
        <form action={updateIncident} className="stack no-print rst-fix">
          <input type="hidden" name="id" value={inc.id} /><input type="hidden" name="resident_id" value={resident.id} />
          <input type="hidden" name="step" value="rst_first" />
          <label>What was tried first? ⭐<textarea name="tried_first" rows={2} required defaultValue={inc.tried_first ?? ''} /></label>
          <label>Hold or method used<input name="hold_used" defaultValue={inc.hold_used ?? ''} /></label>
          <label className="check"><input type="checkbox" name="no_prohibited" required defaultChecked={inc.no_prohibited} /> ⭐ No prone hold, no pressure on neck, chest or back, no mechanical or chemical restraint, no seclusion</label>
          <button className="secondary">Save</button>
        </form>
      )}
      <ul className="checklist">
        <RstStep inc={inc} resident={resident} step="rst_injury" done={inc.injury_check_at} detail={inc.injury_check_note} label="Checked the person for injuries and how they’re feeling" placeholder="What you found (for example: no injuries, calm)" />
        <RstStep inc={inc} resident={resident} step="rst_person" done={inc.person_debrief_at} detail={inc.person_view} label="Debrief with the person — their side, in their words" placeholder="What they said" />
        <RstStep inc={inc} resident={resident} step="rst_staff" done={inc.staff_debrief_at} detail={inc.staff_view} label="Staff debrief — what happened and what could prevent it" placeholder="Staff side and ideas" />
        <RstStep inc={inc} resident={resident} step="rst_funder" done={inc.funder_told_at} detail={inc.funder_told_who} label={funder} placeholder="Who you spoke to" />
        <RstStep inc={inc} resident={resident} step="rst_review" done={inc.manager_review_at} detail={inc.manager_review} label="Program Coordinator or Manager review (was it needed? plan changes?)" placeholder="Review and any plan changes" canDo={lead} />
      </ul>
      <p className="muted small">The incident can’t be closed until these are done.</p>
    </div>
  );
}
