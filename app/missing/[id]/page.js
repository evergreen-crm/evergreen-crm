// 🔎 One missing log: live timer, deadlines, search and "who was told" steps, police info sheet, found, debrief.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { age, fmtDate, fmtDateTime } from '@/lib/options';
import { plainError } from '@/lib/plain';
import { SEARCH_STEPS, TELL_STEPS, RETURN_STEPS, STEP_LABEL, fmtMins } from '@/lib/missing';
import PrintButton from '@/app/PrintButton';
import Elapsed from '../Elapsed';
import { missingStep, missingFound, missingClose } from '../actions';

function Step({ id, st, done, disabled }) {
  return (
    <li className={`miss-step${done ? ' done' : ''}`}>
      <span className="miss-tick">{done ? '✓' : '○'}</span>
      <div style={{ flex: 1 }}>
        <div>{st.label}{done && <span className="muted small"> · {fmtDateTime(done.at)}{done.note ? ` · ${done.note}` : ''}</span>}</div>
        {!done && !disabled && (
          <form action={missingStep} className="miss-form">
            <input type="hidden" name="id" value={id} /><input type="hidden" name="step" value={st.key} />
            {st.extra && <input name="extra" placeholder={st.extra} aria-label={st.extra} />}
            <input name="note" placeholder="Note (optional)" aria-label="Note" />
            <button className="small-btn">Done</button>
          </form>
        )}
      </div>
    </li>
  );
}

export default async function MissingLog({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: e } = await supabase.from('missing_episodes')
    .select('*, residents(*), homes(name, phone, on_call_phone), starter:started_by(full_name), closer:closed_by(full_name)').eq('id', id).maybeSingle();
  if (!e) notFound();
  const { data: log } = await supabase.from('missing_log').select('id, at, step, note, profiles:by(full_name)').eq('episode_id', id).order('at');
  const r = e.residents ?? {};
  const name = `${r.preferred_name || r.first_name} ${r.last_name ?? ''}`;
  const firstDone = (key) => (log ?? []).find((l) => l.step === key);
  const live = e.status === 'Missing';
  const mins = Math.floor(((live ? Date.now() : new Date(e.found_at).getTime()) - new Date(e.started_at).getTime()) / 60000);
  const at = (m) => fmtDateTime(new Date(new Date(e.started_at).getTime() + m * 60000));
  const deadline = (label, m, doneAt) => {
    const state = doneAt ? 'done' : mins >= m ? 'late' : 'due';
    return <li className={`miss-dl ${state}`}><strong>{label}</strong><span>{doneAt ? `✓ ${fmtDateTime(doneAt)}` : `${state === 'late' ? 'Overdue — ' : 'By '}${at(m)}`}</span></li>;
  };
  const lead = levelOf(profile) >= 2 || profile.role === 'admin';

  return (
    <main>
      <p className="small no-print"><Link href="/missing">← Missing</Link> · <Link href={`/residents/${e.resident_id}`}>{name}’s page</Link></p>
      {sp?.ok && <p className="message ok no-print">{sp.ok}</p>}
      {sp?.error && <p className="message error no-print">{plainError(sp.error)}</p>}

      <div className={`miss-head ${e.status.toLowerCase()} no-print`}>
        <div>
          <h1 style={{ margin: 0 }}>{live ? '🔎 MISSING' : e.status === 'Found' ? '✅ BACK' : '🗂 Closed'}: {name}</h1>
          <p style={{ margin: '4px 0 0' }}>
            {e.homes?.name} · reported {fmtDateTime(e.started_at)} by {e.starter?.full_name ?? 'staff'}
            {e.higher_risk && <span className="badge bad"> Higher risk</span>}
          </p>
        </div>
        <div className="miss-clock">{live ? <>Missing for<br /><strong><Elapsed since={e.started_at} /></strong></> : <>Missing for<br /><strong>{fmtMins(mins)}</strong></>}</div>
      </div>

      {live && (
        <p className="message error no-print"><strong>Danger or higher risk? Call <a href="tel:911">911</a> now.</strong> Then on-call{e.homes?.on_call_phone && <> (<a href={`tel:${e.homes.on_call_phone}`}>{e.homes.on_call_phone}</a>)</>}. Search for 30 minutes at most — do the steps at the same time, not one after another.</p>
      )}

      {e.status !== 'Closed' && (
        <section className="card no-print">
          <h2 style={{ marginTop: 0 }}>⏱ Deadlines</h2>
          <ul className="miss-dls">
                        {deadline('Program Manager told', 30, e.pm_told_at)}
            {deadline(e.higher_risk ? 'Police (higher risk: now)' : 'Police if no direction', e.higher_risk ? 0 : 60, e.police_called_at)}
            {deadline('Executive Director told', 120, e.ed_told_at)}
            {deadline('Critical incident report (24 h)', 1440, null)}
          </ul>
          {e.incident_id && <p className="small" style={{ margin: '6px 0 0' }}>A critical incident was opened automatically. <Link href={`/residents/${e.resident_id}?tab=incidents`}>Finish the incident report →</Link></p>}
        </section>
      )}

      <section className="card no-print" id="steps">
        <h2 style={{ marginTop: 0 }}>🔍 Search</h2>
        <ul className="miss-steps">{SEARCH_STEPS.map((st) => <Step key={st.key} id={id} st={st} done={firstDone(st.key)} disabled={!live} />)}</ul>
        <h2>📞 Who has been told</h2>
        <ul className="miss-steps">{TELL_STEPS.map((st) => <Step key={st.key} id={id} st={st} done={firstDone(st.key)} disabled={e.status === 'Closed'} />)}</ul>
        {e.police_file && <p className="small">Police file: <strong>{e.police_file}</strong></p>}
        {e.status !== 'Closed' && (
          <form action={missingStep} className="miss-form" style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={id} />
            <select name="step" defaultValue="sighting" aria-label="Kind"><option value="sighting">👀 Sighting / new info</option><option value="note">📝 Note</option></select>
            <input name="note" placeholder="What happened, where, who told you" aria-label="Details" required style={{ flex: '1 1 220px' }} />
            <button className="small-btn">Add</button>
          </form>
        )}
      </section>

      {live && (
        <section className="card no-print">
          <h2 style={{ marginTop: 0 }}>✅ They’re back or found</h2>
          <form action={missingFound}>
            <input type="hidden" name="id" value={id} />
            <label>Where were they / where found?<input name="where" /></label>
            <label>How are they? (injuries, mood, anything they said)<textarea name="notes" rows={2} /></label>
            <button>✅ Mark as back</button>
          </form>
        </section>
      )}

      {e.status !== 'Missing' && (
        <section className="card no-print">
          <h2 style={{ marginTop: 0 }}>🏠 After they’re back</h2>
          <p className="small">Back {fmtDateTime(e.found_at)}{e.found_where && ` · ${e.found_where}`}{e.return_notes && ` · ${e.return_notes}`}</p>
          <ul className="miss-steps">{RETURN_STEPS.map((st) => <Step key={st.key} id={id} st={st} done={firstDone(st.key)} disabled={e.status === 'Closed'} />)}</ul>
          {e.status === 'Found' && (lead ? (
            <form action={missingClose}>
              <input type="hidden" name="id" value={id} />
              <label>Debrief (Program Coordinator or Manager) ⭐<textarea name="debrief" rows={3} required minLength={10} placeholder="Where they were, why they left, what helped, and the plan to prevent it next time" /></label>
              <button>🗂 Close the missing log</button>
            </form>
          ) : <p className="muted small">A Program Coordinator or Manager debriefs and closes this log.</p>)}
          {e.status === 'Closed' && <p className="small"><strong>Debrief</strong> ({e.closer?.full_name}, {fmtDateTime(e.closed_at)}): {e.debrief_notes}</p>}
        </section>
      )}

      <section className="card miss-sheet">
        <div className="title-row"><h2 style={{ marginTop: 0 }}>🚓 Information for police</h2><span className="no-print"><PrintButton label="🖨 Print for police" /></span></div>
        <p className="small"><strong>Please don’t say publicly that this person is in care.</strong></p>
        <dl className="facts">
          <dt>Name</dt><dd>{r.first_name} {r.last_name}{r.preferred_name && ` (goes by ${r.preferred_name})`}</dd>
          {r.date_of_birth && <><dt>Date of birth</dt><dd>{fmtDate(r.date_of_birth)} (age {age(r.date_of_birth)})</dd></>}
          {r.gender && <><dt>Gender</dt><dd>{r.gender}</dd></>}
          <dt>Last seen</dt><dd>{e.last_seen_at ? fmtDateTime(e.last_seen_at) : '—'}{e.last_seen_where && ` · ${e.last_seen_where}`}{e.last_seen_with && ` · with ${e.last_seen_with}`}</dd>
          <dt>Wearing</dt><dd>{e.clothing ?? '—'}</dd>
          {e.higher_risk && <><dt>Risk</dt><dd>Higher risk{e.risk_notes && `: ${e.risk_notes}`}</dd></>}
          {r.allergies && <><dt>Allergies</dt><dd>{r.allergies}</dd></>}
          {r.diagnoses && <><dt>Health</dt><dd>{r.diagnoses}</dd></>}
          {r.medications_summary && <><dt>Medications</dt><dd>{r.medications_summary}</dd></>}
          {r.behaviour_support_notes && <><dt>Support needs</dt><dd>{r.behaviour_support_notes}</dd></>}
          {r.school_or_day_program && <><dt>School / program</dt><dd>{r.school_or_day_program}</dd></>}
          {r.case_worker_name && <><dt>Social worker</dt><dd>{[r.case_worker_name, r.case_worker_phone].filter(Boolean).join(' · ')}</dd></>}
          <dt>Home</dt><dd>{e.homes?.name}{e.homes?.phone && ` · ${e.homes.phone}`}</dd>
          {e.police_file && <><dt>Police file</dt><dd>{e.police_file}</dd></>}
        </dl>
        <p className="muted small">Add a recent photo from their file. Sightings and steps are in the log below.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>🕒 Log</h2>
        <ol className="miss-log">
          {(log ?? []).map((l) => (
            <li key={l.id}><span className="muted small">{fmtDateTime(l.at)}</span> <strong>{STEP_LABEL[l.step] ?? l.step}</strong>{l.note && ` — ${l.note}`} <span className="muted small">({l.profiles?.full_name ?? 'staff'})</span></li>
          ))}
        </ol>
      </section>
    </main>
  );
}
