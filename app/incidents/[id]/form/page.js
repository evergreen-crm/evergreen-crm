// 📄 Official incident form (MCFD CF4179 or CLBC Critical Incident Report), filled from the CRM incident.
// Top (screen only): countdown, what's still missing, extra details, who was notified, Mark sent.
// Below: the form itself — 🖨 Print or "Save as PDF" and send it to the funder.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf, personLabel } from '@/lib/levels';
import { programsFor } from '@/lib/requirements';
import { countdown, FORM_NAME } from '@/lib/incidents';
import { buildForm, missing, knownNotices } from '@/lib/incidentForm';
import { plainError } from '@/lib/plain';
import { todayISO, TZ } from '@/lib/options';
import PrintButton from '@/app/PrintButton';
import { saveFormDetails, addNotified, removeNotified, markFormSent } from './actions';

export const dynamic = 'force-dynamic';
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-CA', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }) : '');
const YesNo = ({ name, value }) => (
  <select name={name} defaultValue={value === true ? 'yes' : value === false ? 'no' : ''}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select>
);

export default async function IncidentForm({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: inc } = await supabase.from('incidents').select('*').eq('id', id).maybeSingle();
  if (!inc) notFound();
  const [{ data: resident }, { data: home }, { data: people }] = await Promise.all([
    supabase.from('residents').select('*').eq('id', inc.resident_id).maybeSingle(),
    supabase.from('homes').select('id, name, address, phone').eq('id', inc.home_id).maybeSingle(),
    supabase.from('profiles').select('id, full_name, role, level, staff_group').in('id', [inc.prepared_by, inc.reported_by, inc.form_sent_by].filter(Boolean)),
  ]);
  const byId = Object.fromEntries((people ?? []).map((p) => [p.id, { ...p, title: personLabel(p) }]));
  const program = inc.form_program ?? programsFor(resident ?? {})[0]?.key ?? 'mcfd';
  const form = buildForm(program, { inc, resident, home, preparer: byId[inc.prepared_by] ?? byId[inc.reported_by], sender: byId[inc.form_sent_by] });
  const gaps = missing(program, { inc, resident, home });
  const cd = !inc.form_sent_at ? countdown(inc.form_due_at) : null;
  const canSend = levelOf(profile) >= 2 || profile.role === 'admin';
  const suggestions = knownNotices(inc, resident, program).filter((k) => !(inc.notified ?? []).some((n) => n.name === k.name));
  const today = todayISO();
  const name = resident ? resident.preferred_name || resident.first_name : 'resident';

  return (
    <main className="report incform-page">
      <div className="no-print">
        <p className="small"><Link href={`/residents/${inc.resident_id}?tab=incidents`}>← Back to {name}’s incidents</Link></p>
        <div className="title-row">
          <h1 style={{ marginBottom: 0 }}>📄 {FORM_NAME[program]}</h1>
          <PrintButton label="🖨 Print / Save as PDF" />
        </div>
        {sp.ok && <p className="message ok">{sp.ok}</p>}
        {sp.error && <p className="message error">{plainError(sp.error)}</p>}
        {!inc.is_critical ? <p className="message">This incident is not marked critical, so no form is needed for the funder.</p> : inc.form_sent_at ? (
          <p className="message ok">✓ Sent {when(inc.form_sent_at)}{inc.form_sent_to ? ` to ${inc.form_sent_to}` : ''}{byId[inc.form_sent_by] ? ` by ${byId[inc.form_sent_by].full_name}` : ''}.</p>
        ) : cd ? (
          <p className={`message ${cd.late ? 'error' : cd.tone === 'bad' ? 'error' : ''} incform-countdown`}>⏳ <strong>{cd.text}</strong> — by {when(inc.form_due_at)}{when(inc.form_due_at).endsWith('.') ? '' : '.'} {cd.late ? 'The Director of Operations and Executive Director have been alerted.' : 'Leaders are reminded automatically until it is marked sent.'}</p>
        ) : null}

        {gaps.length > 0 && (
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Still to fill in ({gaps.length})</h2>
            <ul className="small">{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            <p className="small muted">Fill in what you can below. Anything left empty prints as a blank line you can write in by hand.</p>
          </section>
        )}

        <details className="card" open={gaps.length > 0}>
          <summary><strong>Details for the form</strong></summary>
          <form action={saveFormDetails}>
            <input type="hidden" name="id" value={inc.id} />
            <div className="row">
              <label>Location of incident<input name="location" defaultValue={inc.location ?? ''} placeholder="e.g. kitchen, front yard, school" /></label>
              <label>Police / RCMP involved?<YesNo name="police_involved" value={inc.police_involved} /></label>
              <label>Police file number<input name="police_file" defaultValue={inc.police_file ?? ''} /></label>
            </div>
            {program === 'mcfd' && (
              <div className="row">
                <label>Coroner involved?<YesNo name="coroner_involved" value={inc.coroner_involved} /></label>
                <label>Coroner file number<input name="coroner_file" defaultValue={inc.coroner_file ?? ''} /></label>
              </div>
            )}
            <label>Individuals involved — names and roles (staff, visitors). Don’t name any other child or youth in the home.<textarea name="people_involved" rows={2} defaultValue={inc.people_involved ?? inc.staff_involved ?? ''} /></label>
            {program === 'mcfd' && <label>Contributing factors and related incidents (and any early interventions or prevention used)<textarea name="contributing" rows={2} defaultValue={inc.contributing ?? ''} placeholder="Write “None known” if there are none" /></label>}
            <label>How the incident has been addressed to date<textarea name="addressed" rows={2} defaultValue={inc.addressed ?? ''} /></label>
            {program === 'clbc' && <label>Measures to prevent it happening again<textarea name="prevention" rows={2} defaultValue={inc.prevention ?? ''} /></label>}
            <button>Save details</button>
          </form>
        </details>

        <details className="card" open={!(inc.notified ?? []).length}>
          <summary><strong>Who was notified ({(inc.notified ?? []).length})</strong></summary>
          {suggestions.length > 0 && <p className="small muted">From the incident: {suggestions.map((s) => `${s.name} (${s.role}${s.at ? ', ' + when(s.at) : ''})`).join(' · ')} — add them below.</p>}
          {(inc.notified ?? []).length > 0 && (
            <ul className="small">{inc.notified.map((n, i) => (
              <li key={i}>{n.name}{n.role ? `, ${n.role}` : ''}{n.org ? ` (${n.org})` : ''}{n.at ? ` · ${when(n.at)}` : ''}{n.method ? ` · ${n.method}` : ''}
                <form action={removeNotified} style={{ display: 'inline' }}><input type="hidden" name="id" value={inc.id} /><input type="hidden" name="i" value={i} /> <button className="link small">remove</button></form></li>
            ))}</ul>
          )}
          <form action={addNotified}>
            <input type="hidden" name="id" value={inc.id} />
            <div className="row">
              <label>Name<input name="name" required maxLength={120} defaultValue={suggestions[0]?.name ?? ''} /></label>
              <label>Role<input name="role" maxLength={120} defaultValue={suggestions[0]?.role ?? ''} placeholder="Social worker, parent, on-call…" /></label>
              <label>Organization<input name="org" maxLength={120} defaultValue={suggestions[0]?.org ?? ''} /></label>
            </div>
            <div className="row">
              <label>Date<input type="date" name="date" defaultValue={today} max={today} /></label>
              <label>Time<input type="time" name="time" /></label>
              <label>Method<select name="method" defaultValue="Phone"><option>Phone</option><option>In person</option><option>Email</option><option>Text</option><option>Voicemail</option></select></label>
              <label>Got a copy of the form?<YesNo name="copy" value={null} /></label>
            </div>
            <button className="secondary">+ Add</button>
          </form>
        </details>

        {inc.is_critical && !inc.form_sent_at && (
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Send it</h2>
            <ol className="small">
              <li>Check the form below, then tap <strong>🖨 Print / Save as PDF</strong>.</li>
              <li>{program === 'clbc'
                ? 'Email it as a password-protected PDF (the password CLBC gave you) to your CLBC liaison analyst AND the local CLBC office mailbox — or fax it.'
                : `Send it to the MCFD Primary Professional${resident?.case_worker_email ? ` (${resident.case_worker_email})` : ''} and the MCFD Resource Worker${resident?.resource_worker_email ? ` (${resident.resource_worker_email})` : ''}.`}</li>
              <li>Come back and tap <strong>Mark sent</strong> — this stops the reminders.</li>
            </ol>
            {canSend ? (
              <form action={markFormSent} className="row" style={{ alignItems: 'end' }}>
                <input type="hidden" name="id" value={inc.id} />
                <label>Sent to (names and emails)<input name="sent_to" required maxLength={300} defaultValue={[resident?.case_worker_name, resident?.case_worker_email].filter(Boolean).join(' ')} /></label>
                <button>✓ Mark sent</button>
              </form>
            ) : <p className="small muted">Your Program Coordinator or Manager sends the form and marks it sent.</p>}
          </section>
        )}
      </div>

      <article className="incform">
        <header>
          <p className="incform-sub">{form.subtitle}</p>
          <h2>{form.title}</h2>
          <p className="incform-note">{form.note}</p>
          {inc.form_number && <p className="incform-no">Incident #{inc.form_number}</p>}
        </header>
        {form.sections.map((s) => (
          <section key={s.title} className="incform-sec">
            <h3>{s.title}</h3>
            {s.hint && <p className="incform-hint">{s.hint}</p>}
            {s.rows && <table><tbody>{s.rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v || <span className="incform-blank" />}</td></tr>)}</tbody></table>}
            {s.table && (
              <table className="incform-grid">
                <thead><tr>{s.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{[...s.table.rows, ...Array(Math.max(0, 3 - s.table.rows.length)).fill(null)].map((row, i) => <tr key={i}>{s.table.head.map((_, j) => <td key={j}>{row?.[j] ?? ''}</td>)}</tr>)}</tbody>
              </table>
            )}
            {s.sign && (
              <table className="incform-sign"><tbody>{s.sign.map(([role, nm, title]) => (
                <tr key={role}><th>{role}</th><td>{[nm, title].filter(Boolean).join(', ')}</td><td className="incform-line">Signature</td><td className="incform-line">Date / time</td></tr>
              ))}</tbody></table>
            )}
          </section>
        ))}
        <p className="incform-foot">Prepared in the Evergreen Community Care CRM from incident report {inc.form_number ?? inc.id.slice(0, 8)}. Confidential.</p>
      </article>
    </main>
  );
}
