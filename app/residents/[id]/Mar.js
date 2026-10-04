// "Medications" tab: medication list and MAR (medication administration record).
import Link from 'next/link';
import { MED_ROUTES, fmtDate, fmtTime, fmtDateTime, todayISO, nowTime, addDaysISO } from '@/lib/options';
import { addMedication, stopMedication, recordDose } from '@/app/residents/modules';

const STATUSES = ['Given', 'Refused', 'Missed', 'Held', 'Error'];

function minutes(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

export default async function Mar({ supabase, resident, canEdit, date }) {
  const today = todayISO();
  const day = date ?? today;
  const [{ data: meds }, { data: given }, { data: history }] = await Promise.all([
    supabase.from('medications').select('*').eq('resident_id', resident.id).order('name'),
    supabase.from('med_administrations').select('*, profiles:given_by(full_name)')
      .eq('resident_id', resident.id).eq('admin_date', day).order('given_at'),
    supabase.from('med_administrations').select('*, medications(name, dose), profiles:given_by(full_name)')
      .eq('resident_id', resident.id).gte('admin_date', addDaysISO(today, -14)).neq('status', 'Given')
      .order('given_at', { ascending: false }).limit(50),
  ]);
  const active = (meds ?? []).filter((m) => m.active);
  const stopped = (meds ?? []).filter((m) => !m.active);
  const scheduled = active.filter((m) => !m.is_prn);
  const prn = active.filter((m) => m.is_prn);
  const now = day === today ? minutes(nowTime()) : day < today ? 24 * 60 : -1;
  const rec = (medId, time) => given?.find((g) => g.medication_id === medId && (g.scheduled_time ?? null) === (time ?? null));
  const base = `/residents/${resident.id}?tab=mar`;

  // Build the day's dose list, sorted by time.
  const doses = scheduled.flatMap((m) => m.times.map((t) => ({ med: m, time: t, rec: rec(m.id, t) })))
    .sort((a, b) => a.time.localeCompare(b.time));
  const done = doses.filter((d) => d.rec).length;
  const late = doses.filter((d) => !d.rec && now - minutes(d.time) > 60).length;

  return (
    <section>
      {resident.allergies && <p className="alert">Allergies: {resident.allergies}</p>}
      <div className="title-row">
        <h2>MAR — {fmtDate(day)}</h2>
        <span className="small no-print">
          <Link href={`${base}&mdate=${addDaysISO(day, -1)}`}>← Previous day</Link>{' · '}
          {day !== today && <><Link href={base}>Today</Link>{' · '}</>}
          <Link href={`${base}&mdate=${addDaysISO(day, 1)}`}>Next day →</Link>
        </span>
      </div>
      <div className="stats">
        <div className="stat"><strong>{done} / {doses.length}</strong><span>scheduled doses signed</span></div>
        <div className={`stat ${late ? 'bad' : ''}`}><strong>{late}</strong><span>late (over 1 hour)</span></div>
      </div>

      {doses.length === 0 && <p className="muted">No scheduled medications.</p>}
      {doses.length > 0 && (
        <table>
          <thead><tr><th>Time</th><th>Medication</th><th>Signed</th></tr></thead>
          <tbody>
            {doses.map(({ med, time, rec: r }) => {
              const isLate = !r && now - minutes(time) > 60;
              return (
                <tr key={med.id + time} className={isLate ? 'late' : ''}>
                  <td><strong>{fmtTime(time)}</strong>{isLate && <div><span className="badge bad">Late</span></div>}</td>
                  <td>{med.name} {med.dose && <span className="muted">· {med.dose}</span>} {med.route && <span className="muted small">· {med.route}</span>}
                    {med.instructions && <div className="muted small">{med.instructions}</div>}</td>
                  <td>
                    {r ? (
                      <span>
                        <span className={`badge ${r.status === 'Given' ? '' : 'bad'}`}>{r.status}</span>{' '}
                        <span className="small muted">{r.profiles?.full_name ?? 'Staff'} · {fmtDateTime(r.given_at)}</span>
                        {r.reason && <div className="small">{r.reason}</div>}
                      </span>
                    ) : (
                      <form action={recordDose} className="mar-form no-print">
                        <input type="hidden" name="medication_id" value={med.id} />
                        <input type="hidden" name="resident_id" value={resident.id} />
                        <input type="hidden" name="admin_date" value={day} />
                        <input type="hidden" name="scheduled_time" value={time} />
                        <select name="status" defaultValue="Given">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                        <input name="reason" placeholder="Reason (if not given)" />
                        <button>Sign</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h2>As needed (PRN)</h2>
      {prn.length === 0 && <p className="muted">No PRN medications.</p>}
      {prn.map((m) => {
        const todays = given?.filter((g) => g.medication_id === m.id) ?? [];
        return (
          <div key={m.id} className="card">
            <strong>{m.name}</strong> {m.dose && <span className="muted">· {m.dose}</span>}
            {m.instructions && <div className="muted small">{m.instructions}</div>}
            {todays.map((g) => (
              <div key={g.id} className="small">✓ {g.status} {fmtDateTime(g.given_at)} by {g.profiles?.full_name ?? 'staff'} — {g.reason}</div>
            ))}
            <form action={recordDose} className="mar-form no-print">
              <input type="hidden" name="medication_id" value={m.id} />
              <input type="hidden" name="resident_id" value={resident.id} />
              <input type="hidden" name="admin_date" value={day} />
              <select name="status" defaultValue="Given">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              <input name="reason" required placeholder="Why it was given (required)" />
              <button>Record PRN</button>
            </form>
          </div>
        );
      })}

      <h2>Exceptions — last 14 days</h2>
      <p className="muted small">Refused, missed, held and error doses. Medication errors must also be reported as an incident.</p>
      {history?.length === 0 && <p className="muted">None.</p>}
      <ul className="timeline">
        {history?.map((h) => (
          <li key={h.id} className="important">
            <div className="meta"><span className="badge bad">{h.status}</span> {fmtDate(h.admin_date)} {h.scheduled_time && `· ${fmtTime(h.scheduled_time)}`} · {h.profiles?.full_name ?? 'Staff'}</div>
            <p>{h.medications?.name} {h.medications?.dose} — {h.reason}</p>
          </li>
        ))}
      </ul>

      <h2>Medication list</h2>
      <table>
        <thead><tr><th>Medication</th><th>Times</th><th>Prescriber</th>{canEdit && <th></th>}</tr></thead>
        <tbody>
          {active.length === 0 && <tr><td colSpan={4} className="muted">No medications yet.</td></tr>}
          {[...active, ...stopped].map((m) => (
            <tr key={m.id} className={m.active ? '' : 'inactive'}>
              <td>{m.name} {m.dose && `· ${m.dose}`} {m.route && <span className="muted small">· {m.route}</span>}
                {m.instructions && <div className="muted small">{m.instructions}</div>}</td>
              <td>{m.is_prn ? 'PRN (as needed)' : m.times.map(fmtTime).join(', ')}</td>
              <td>{m.prescriber ?? '—'}{m.start_date && <div className="muted small">from {fmtDate(m.start_date)}{m.end_date && ` to ${fmtDate(m.end_date)}`}</div>}</td>
              {canEdit && (
                <td>
                  <form action={stopMedication}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="resident_id" value={resident.id} />
                    <input type="hidden" name="active" value={m.active ? 'false' : 'true'} />
                    <button className="link small">{m.active ? 'Stop' : 'Restart'}</button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {canEdit && (
        <details className="card no-print">
          <summary><strong>+ Add a medication</strong></summary>
          <form action={addMedication}>
            <input type="hidden" name="resident_id" value={resident.id} />
            <div className="row">
              <label>Medication name<input name="name" required /></label>
              <label>Dose<input name="dose" placeholder="e.g., 10 mg, 1 tablet" /></label>
              <label>Route
                <select name="route" defaultValue="Oral">{MED_ROUTES.map((r) => <option key={r}>{r}</option>)}</select>
              </label>
            </div>
            <div className="row">
              <label>Times to give<input name="times" placeholder="e.g., 08:00, 20:00" /></label>
              <label className="check"><input type="checkbox" name="is_prn" /> As needed (PRN)</label>
            </div>
            <div className="row">
              <label>Prescriber<input name="prescriber" /></label>
              <label>Start date<input type="date" name="start_date" defaultValue={today} /></label>
            </div>
            <label>Instructions<input name="instructions" placeholder="e.g., with food; PRN: max 2 doses in 24 hours" /></label>
            <button>Add medication</button>
          </form>
        </details>
      )}
    </section>
  );
}
