// "Incidents" tab: incident and critical incident reports with reporting deadlines.
import { INCIDENT_TYPES } from '@/lib/requirements';
import { fmtDate, fmtTime, todayISO, TZ } from '@/lib/options';
import { addIncident, updateIncident } from '@/app/residents/actions';
import { writtenDue, reviewDue, INCIDENT_CLASSES } from '@/lib/incidents';
import Link from 'next/link';

export default async function Incidents({ supabase, resident, program, cls }) {
  let q = supabase.from('incidents').select('*, profiles:reported_by(full_name)').eq('resident_id', resident.id);
  if (cls) q = q.eq('incident_class', cls);
  const { data: incidents } = await q.order('occurred_on', { ascending: false });
  const base = `/residents/${resident.id}?tab=incidents`;
  const today = todayISO();
  const who = program === 'clbc' ? 'CLBC liaison analyst' : 'MCFD social worker';

  return (
    <section>
      <div className="pills no-print">
        <Link href={base} className={!cls ? 'on' : ''}>All</Link>
        {INCIDENT_CLASSES.map((c) => <Link key={c.key} href={`${base}&class=${c.key}`} className={cls === c.key ? 'on' : ''}>{c.key}</Link>)}
      </div>
      <details className="card no-print" open={incidents?.length === 0 && !cls}>
        <summary><strong>+ Report an incident</strong></summary>
        <form action={addIncident} className="stack">
          <input type="hidden" name="resident_id" value={resident.id} />
          <input type="hidden" name="home_id" value={resident.home_id} />
          <div className="row">
            <label>Date<input type="date" name="occurred_on" required defaultValue={today} /></label>
            <label>Time<input type="time" name="occurred_time" /></label>
            <label>
              Type
              <select name="incident_type" required defaultValue="">
                <option value="" disabled>Pick a type</option>
                {INCIDENT_TYPES.map((t) => <option key={t}>{t}</option>)}
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
                    <span>Written report sent to {program === 'clbc' ? 'CLBC' : 'MCFD'}
                      <div className="muted small">{inc.written_report_sent_on ? `Sent ${fmtDate(inc.written_report_sent_on)}` : `Due ${fmtDate(wDue)}`}
                        {late(wDue, inc.written_report_sent_on) && <span className="badge bad">Overdue</span>}</div>
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
