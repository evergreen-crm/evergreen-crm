// "Incidents" tab: incident and critical incident reports with reporting deadlines.
import { INCIDENT_TYPES } from '@/lib/requirements';
import { fmtDate, fmtTime, todayISO, TZ } from '@/lib/options';
import { addIncident, updateIncident } from '@/app/residents/actions';

// Written report deadline: urgent = 24 hours (MCFD & CLBC);
// otherwise MCFD 72 hours, CLBC 5 working days.
function writtenDue(inc, program) {
  const d = new Date(inc.occurred_on + 'T12:00:00Z');
  if (inc.is_urgent) d.setUTCDate(d.getUTCDate() + 1);
  else if (program === 'clbc') {
    let added = 0;
    while (added < 5) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) added++; }
  } else d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
}

function reviewDue(inc) { // internal review within 5 business days (MCFD Policy 6.3)
  const d = new Date(inc.occurred_on + 'T12:00:00Z');
  let added = 0;
  while (added < 5) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) added++; }
  return d.toISOString().slice(0, 10);
}

export default async function Incidents({ supabase, resident, program }) {
  const { data: incidents } = await supabase
    .from('incidents').select('*, profiles:reported_by(full_name)')
    .eq('resident_id', resident.id).order('occurred_on', { ascending: false });
  const today = todayISO();
  const who = program === 'clbc' ? 'CLBC liaison analyst' : 'MCFD social worker';

  return (
    <section>
      <details className="card no-print" open={incidents?.length === 0}>
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
          <label>What happened<textarea name="description" rows={4} required /></label>
          <label>Actions taken<textarea name="actions_taken" rows={2} /></label>
          <label className="check"><input type="checkbox" name="is_critical" defaultChecked /> Critical incident — must be reported to {program === 'clbc' ? 'CLBC' : 'MCFD'}</label>
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
                {inc.is_critical && <span className="badge bad">Critical</span>}{' '}
                {inc.is_urgent && <span className="badge bad">Urgent</span>}{' '}
                <span className={`badge ${inc.status === 'Open' ? 'warn' : ''}`}>{inc.status}</span>
              </span>
            </div>
            <p className="muted small">
              {fmtDate(inc.occurred_on)}{inc.occurred_time && ` · ${fmtTime(inc.occurred_time)}`} · reported by {inc.profiles?.full_name ?? 'staff'}
            </p>
            <p>{inc.description}</p>
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
