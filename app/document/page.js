// 📝 Document records: choose a house and a child, then write everything for one day on one page.
// Records by section (from the documentation guide), medication (sign each dose), and goals with their steps.
// One date at the top applies to every form. The time is recorded automatically when you save.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { todayISO, addDaysISO, fmtDate, fmtTime } from '@/lib/options';
import { recordsFor, isDaily } from '@/lib/records';
import { recordDose } from '@/app/residents/modules';
import { addGoalStep, toggleGoalStep } from '@/app/document/actions';
import RecordForm from '@/app/components/RecordForm';

const isId = (s) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const nameOf = (r) => `${r.preferred_name || r.first_name} ${r.last_name}`;
const STATUSES = ['Given', 'Refused', 'Missed', 'Held', 'Error'];

export default async function DocumentRecords({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const today = todayISO();
  const date = isDate(sp.date) && sp.date <= today ? sp.date : today;

  const { data: homes } = await supabase.from('homes').select('id, name, program').order('name');
  const houseId = isId(sp.house) ? sp.house : (homes ?? []).find((h) => h.id === profile.home_id)?.id ?? null;
  const house = (homes ?? []).find((h) => h.id === houseId) ?? null;
  const { data: residents } = house
    ? await supabase.from('residents').select('id, first_name, preferred_name, last_name, status').eq('home_id', house.id).neq('status', 'discharged').order('first_name')
    : { data: [] };
  const resident = isId(sp.resident) ? (residents ?? []).find((r) => r.id === sp.resident) ?? null : null;
  const records = recordsFor(house?.program);
  const here = (extra = '') => `/document?house=${house?.id}&resident=${resident?.id}&date=${date}${extra}`;

  // Everything for this resident on this date.
  let doneKinds = new Set(), meds = [], doses = [], goals = [], steps = [];
  if (resident && records.length) {
    const { data: ent } = await supabase.from('entries').select('kind').eq('resident_id', resident.id).eq('entry_date', date);
    doneKinds = new Set((ent ?? []).map((e) => e.kind));
    const { data: m } = await supabase.from('medications').select('id, name, dose, route, times, is_prn, active').eq('resident_id', resident.id).eq('active', true).order('name');
    meds = (m ?? []).filter((x) => !x.is_prn);
    const { data: d } = await supabase.from('med_administrations').select('medication_id, scheduled_time, status, given_at').eq('resident_id', resident.id).eq('admin_date', date);
    doses = d ?? [];
    const { data: g } = await supabase.from('goals').select('id, title, domain, description, target_date, status').eq('resident_id', resident.id).eq('status', 'Active').order('created_at');
    goals = g ?? [];
    if (goals.length) {
      const { data: s } = await supabase.from('goal_steps').select('id, goal_id, step, done_on, sort').in('goal_id', goals.map((x) => x.id)).order('sort').order('created_at');
      steps = s ?? [];
    }
  }
  const doseFor = (medId, time) => doses.find((d) => d.medication_id === medId && (d.scheduled_time ?? null) === (time ?? null));
  const dayLabel = date === today ? 'Today' : fmtDate(date);

  return (
    <main className="doc-form">
      <div className="title-row"><h1>📝 Document records</h1></div>
      <nav className="tabs-bar" aria-label="Houses">
        {(homes ?? []).map((h) => (
          <Link key={h.id} href={`/document?house=${h.id}&date=${date}`} className={h.id === house?.id ? 'on' : ''}>{h.name}{h.program ? ` (${h.program})` : ''}</Link>
        ))}
      </nav>

      {!house && <p className="card">Choose a house above.</p>}
      {house && !house.program && <p className="message error">{house.name} has no program yet. Use Edit house on the house page and choose MCFD or CLBC.</p>}

      {house && house.program && (
        <div className="card no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <strong>Date for everything on this page:</strong>
          <Link className="button secondary" href={`/document?house=${house.id}${resident ? `&resident=${resident.id}` : ''}&date=${addDaysISO(date, -1)}`}>← Day before</Link>
          <form method="get" action="/document" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="hidden" name="house" value={house.id} />
            {resident && <input type="hidden" name="resident" value={resident.id} />}
            <input type="date" name="date" defaultValue={date} max={today} aria-label="Date" />
            <button className="secondary">Go</button>
          </form>
          {date < today && <Link className="button secondary" href={`/document?house=${house.id}${resident ? `&resident=${resident.id}` : ''}&date=${addDaysISO(date, 1)}`}>Day after →</Link>}
          <span className="small muted">{dayLabel}. The time is recorded when you press Save.</span>
        </div>
      )}

      {house && house.program && !resident && (
        <section>
          <h2>{house.name}: choose a child or adult</h2>
          {(residents ?? []).length === 0 && <p className="muted">No current residents in this house yet.</p>}
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {(residents ?? []).map((r) => (
              <Link key={r.id} className="button" href={`/document?house=${house.id}&resident=${r.id}&date=${date}`}>{nameOf(r)}</Link>
            ))}
          </div>
        </section>
      )}

      {house && house.program && resident && (
        <section>
          <p className="small"><Link href={`/document?house=${house.id}&date=${date}`}>← Choose someone else</Link> · <Link href={`/homes/${house.id}?tab=records`}>All records for {house.name}</Link></p>
          <h2 style={{ marginBottom: 4 }}>{nameOf(resident)} · {house.program}</h2>

          <h3>1. Records by section</h3>
          {records.map((rec) => (
            <details key={rec.kind} className="card" open={!doneKinds.has(rec.kind) && (rec.tab ? false : true)} style={{ marginTop: 8 }}>
              <summary>
                <strong>{rec.section}</strong> <span className="muted small">· {rec.standard}</span>{' '}
                {rec.tab
                  ? <span className="small">Medication: see section 2</span>
                  : <span className={doneKinds.has(rec.kind) ? 'badge' : 'badge warn'}>{doneKinds.has(rec.kind) ? 'entered' : 'not yet'}</span>}
              </summary>
              <p className="small muted" style={{ margin: '6px 0' }}>{rec.when}</p>
              {!rec.tab && <RecordForm compact date={date} kind={rec.kind} homeId={house.id} residentId={resident.id} path={here()} goals={goals} />}
            </details>
          ))}

          <h3 style={{ marginTop: 20 }}>2. Medication (sign each dose)</h3>
          {meds.length === 0 && <p className="muted small">No scheduled medications for this person.</p>}
          {meds.map((m) => (
            <div key={m.id} className="card" style={{ marginTop: 8 }}>
              <strong>{m.name}</strong> {m.dose && <span className="muted">· {m.dose}</span>} {m.route && <span className="muted small">· {m.route}</span>}
              {(m.times ?? []).length === 0 && <p className="muted small">No times set for this medication.</p>}
              {(m.times ?? []).map((t) => {
                const d = doseFor(m.id, t);
                return (
                  <div key={t} className="row" style={{ alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 70 }}><strong>{fmtTime(t)}</strong></span>
                    {d ? (
                      <span className={`badge ${d.status === 'Given' ? '' : 'bad'}`}>{d.status}{d.given_at ? ` · ${new Date(d.given_at).toLocaleTimeString('en-CA', { timeZone: 'America/Vancouver', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                    ) : (
                      <form action={recordDose} className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input type="hidden" name="medication_id" value={m.id} />
                        <input type="hidden" name="resident_id" value={resident.id} />
                        <input type="hidden" name="admin_date" value={date} />
                        <input type="hidden" name="scheduled_time" value={t} />
                        <select name="status" defaultValue="Given" aria-label="Status">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                        <input name="reason" placeholder="Reason if not given" aria-label="Reason" />
                        <button>Sign</button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <p className="small" style={{ marginTop: 8 }}>PRN (as-needed) medication is written on the Medications tab of the person’s page.</p>

          <h3 style={{ marginTop: 20 }}>3. Goals and the steps to reach them</h3>
          {goals.length === 0 && <p className="muted small">No active goals. Add goals on the person’s Goals tab.</p>}
          {goals.map((g) => {
            const gs = steps.filter((s) => s.goal_id === g.id);
            return (
              <details key={g.id} className="card" style={{ marginTop: 8 }} open>
                <summary><strong>{g.title}</strong> {g.domain && <span className="muted small">· {g.domain}</span>} {g.target_date && <span className="muted small">· target {fmtDate(g.target_date)}</span>}</summary>
                {g.description && <p className="small" style={{ margin: '6px 0' }}>{g.description}</p>}
                <p className="small"><strong>Steps:</strong> {gs.filter((s) => s.done_on).length} of {gs.length} done</p>
                <ol style={{ margin: '0 0 8px', paddingLeft: 20 }}>
                  {gs.map((s) => (
                    <li key={s.id} style={{ marginBottom: 4 }}>
                      <form action={toggleGoalStep} className="row" style={{ gap: 8, alignItems: 'center', display: 'inline-flex' }}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="path" value={here()} />
                        <input type="hidden" name="done" value={s.done_on ? 'no' : 'yes'} />
                        <button className="secondary small">{s.done_on ? '✓ Done' : 'Mark done'}</button>
                      </form>{' '}
                      <span className={s.done_on ? 'muted' : ''}>{s.step}</span>
                      {s.done_on && <span className="muted small"> · {fmtDate(s.done_on)}</span>}
                    </li>
                  ))}
                </ol>
                <form action={addGoalStep} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <input type="hidden" name="goal_id" value={g.id} />
                  <input type="hidden" name="path" value={here()} />
                  <input name="step" placeholder="Add a step to reach this goal" aria-label="New step" style={{ minWidth: 260 }} />
                  <button className="secondary">Add step</button>
                </form>
              </details>
            );
          })}
          {goals.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <strong className="small">Progress today on a goal</strong>
              <RecordForm compact date={date} kind="goal_progress" homeId={house.id} residentId={resident.id} path={here()} goals={goals} />
            </div>
          )}
        </section>
      )}
    </main>
  );
}
