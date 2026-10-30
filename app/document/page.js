// 📝 Document records: choose a house and a child, then write everything for one day on one page.
// Records by section (from the documentation guide), medication (sign each dose), and goals with their steps.
// One date at the top applies to every form. The time is recorded automatically when you save.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf, groupOf } from '@/lib/levels';
import { todayISO, addDaysISO, fmtDate, fmtTime } from '@/lib/options';
import { recordsFor, isDaily } from '@/lib/records';
import { recordDose } from '@/app/residents/modules';
import { addGoalStep, toggleGoalStep, saveMarSheet } from '@/app/document/actions';
import RecordForm from '@/app/components/RecordForm';

const isId = (s) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const nameOf = (r) => `${r.preferred_name || r.first_name} ${r.last_name}`;
// Mark-sheet answers: the value saved, and the words on the sheet.
const MAR_OPTIONS = [['Given', 'Yes, given'], ['Refused', 'No, refused'], ['Missed', 'No, missed'], ['Held', 'Held'], ['Error', 'Error']];

// The sidebar: one entry for each record, then the medication sheet and goals.
const VIEWS = (records, house) => [
  { key: 'nothing', kind: 'nothing_to_report', icon: '✔', label: 'Nothing to report today' },
  ...records.filter((r) => !r.tab).map((r) => ({ key: r.kind, kind: r.kind, icon: '📝', label: r.section })),
  { key: 'med', icon: '💊', label: 'Medication sheet' },
  { key: 'goals', icon: '🎯', label: 'Goals and steps' },
].map((v, i) => ({ ...v, label: `${i + 1}. ${v.label}` }));

export default async function DocumentRecords({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const canReport = levelOf(profile) >= 2 && !groupOf(profile);
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
  const view = typeof sp.view === 'string' ? sp.view : 'nothing';

  // Everything for this resident on this date.
  let doneKinds = new Set(), meds = [], doses = [], goals = [], steps = [];
  if (resident && records.length) {
    const { data: ent } = await supabase.from('entries').select('kind').eq('resident_id', resident.id).eq('entry_date', date);
    doneKinds = new Set((ent ?? []).map((e) => e.kind));
    const { data: m } = await supabase.from('medications').select('id, name, dose, route, times, is_prn, active').eq('resident_id', resident.id).eq('active', true).order('name');
    meds = m ?? [];
    const { data: d } = await supabase.from('med_administrations').select('medication_id, scheduled_time, status, given_at, reason, staff:given_by(full_name)').eq('resident_id', resident.id).eq('admin_date', date);
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
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <nav aria-label="Records for this person" className="doc-form" style={{ flex: '0 0 220px', minWidth: 200, position: 'sticky', top: 12, background: 'var(--card, #fff)', border: '1px solid #ccc', borderRadius: 8, padding: 10 }}>
            <p className="small" style={{ margin: '0 0 6px' }}><Link href={`/document?house=${house.id}&date=${date}`}>← Choose someone else</Link></p>
            {canReport && <p className="small" style={{ margin: '0 0 6px' }}><Link href={`/reports/daily?home=${house.id}&resident=${resident.id}&from=${date}&to=${date}&go=1`}>🖨 Report for this person</Link></p>}
            <strong style={{ display: 'block', marginBottom: 6 }}>{nameOf(resident)}</strong>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {VIEWS(records, house).map((v) => (
                <li key={v.key}>
                  <Link href={here(`&view=${v.key}`)} aria-current={view === v.key ? 'page' : undefined}
                    style={{ display: 'block', padding: '10px 10px', borderRadius: 6, marginBottom: 4, fontWeight: view === v.key ? 700 : 400, background: view === v.key ? '#e8f0fb' : 'transparent', textDecoration: 'none', color: 'inherit' }}>
                    {v.icon} {v.label}
                    {v.done ? <span className="badge" style={{ marginLeft: 6 }}>done</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="doc-form" style={{ flex: '1 1 640px', minWidth: 0 }}>
            {view === 'med' && (
              <section>
                <h2 style={{ marginTop: 0 }}>💊 Medication sheet for {dayLabel.toLowerCase()}</h2>
                <p className="small muted">Every active medication is on this sheet. For each scheduled time choose Yes (given) or No (not given), and write why if it was not given. As-needed medication has its own row, used only when it was given. Then press Save medication sheet.</p>
                {meds.length === 0 && <p className="muted small">No active medications for this person. Add them on the person’s Medications tab.</p>}
                {meds.length > 0 && (
                  <form action={saveMarSheet}>
                    <input type="hidden" name="resident_id" value={resident.id} />
                    <input type="hidden" name="admin_date" value={date} />
                    <input type="hidden" name="path" value={here('&view=med')} />
                    <div style={{ overflowX: 'auto' }}>
                      <table className="small" style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '2px solid #000' }}>
                            <th style={{ padding: '8px 10px' }}>Medication</th>
                            <th style={{ padding: '8px 10px' }}>Type</th>
                            <th style={{ padding: '8px 10px' }}>Time</th>
                            <th style={{ padding: '8px 10px' }}>Given?</th>
                            <th style={{ padding: '8px 10px' }}>Reason if not given</th>
                          </tr>
                        </thead>
                        <tbody>
                          {meds.flatMap((m) => {
                            const medType = m.is_prn ? 'As needed (PRN)' : 'Scheduled';
                            const label = <><strong>{m.name}</strong><br /><span className="muted">{[m.dose, m.route].filter(Boolean).join(' · ')}</span></>;
                            if (m.is_prn) {
                              // As-needed: every dose already given today shows as its own row, then one blank row to add another.
                              const prnDoses = doses.filter((d) => d.medication_id === m.id && d.scheduled_time == null);
                              const timeText = (d) => (d.given_at ? new Date(d.given_at).toLocaleTimeString('en-GB', { timeZone: 'Etc/GMT+7', hour: '2-digit', minute: '2-digit', hour12: false }) : '');
                              const done = prnDoses.map((d, i) => (
                                <tr key={`${m.id}-prn-done-${i}`} style={{ borderBottom: '1px solid #ccc', verticalAlign: 'top' }}>
                                  <td style={{ padding: 10 }}>{label}</td>
                                  <td style={{ padding: 10 }}>{medType}</td>
                                  <td style={{ padding: 10, minWidth: 160 }}>{timeText(d)}</td>
                                  <td style={{ padding: 10, minWidth: 180 }}><span className={`badge ${d.status === 'Given' ? '' : 'bad'}`}>{d.status}</span>{d.staff?.full_name && <div className="small muted">by {d.staff.full_name}</div>}</td>
                                  <td style={{ padding: 10, minWidth: 220 }}>{d.reason ?? '—'}</td>
                                </tr>
                              ));
                              const blank = (
                                <tr key={`${m.id}-prn-new`} style={{ borderBottom: '1px solid #ccc', verticalAlign: 'top' }}>
                                  <td style={{ padding: 10 }}>{label}</td>
                                  <td style={{ padding: 10 }}>{medType}{prnDoses.length ? ' · add another dose' : ''}</td>
                                  <td style={{ padding: 10, minWidth: 160 }}>
                                    <input type="time" name={`time|${m.id}|prn`} aria-label={`Time for ${m.name}`} />
                                  </td>
                                  <td style={{ padding: 10, minWidth: 180 }}>
                                    <select name={`mar|${m.id}|prn`} defaultValue="" aria-label={`Given for ${m.name}`}><option value="">— leave blank</option>{MAR_OPTIONS.map(([v2, l]) => <option key={v2} value={v2}>{l}</option>)}</select>
                                  </td>
                                  <td style={{ padding: 10, minWidth: 220 }}>
                                    <input name={`reason|${m.id}|prn`} aria-label={`Reason for ${m.name}`} placeholder="Why it was given" />
                                  </td>
                                </tr>
                              );
                              return [...done, blank];
                            }
                            const times = (m.times ?? []).length ? m.times : [null];
                            return times.map((t) => {
                              const d = t ? doseFor(m.id, t) : null;
                              return (
                                <tr key={`${m.id}-${t}`} style={{ borderBottom: '1px solid #ccc', verticalAlign: 'top' }}>
                                  <td style={{ padding: 10 }}>{label}</td>
                                  <td style={{ padding: 10 }}>{medType}</td>
                                  <td style={{ padding: 10 }}><strong>{t ? fmtTime(t) : 'No time set'}</strong></td>
                                  <td style={{ padding: 10, minWidth: 180 }}>
                                    {d ? <span className={`badge ${d.status === 'Given' ? '' : 'bad'}`}>{d.status}</span>
                                      : t ? (
                                        <select name={`mar|${m.id}|${t}`} defaultValue="" aria-label={`Given for ${m.name} at ${fmtTime(t)}`}><option value="">— leave blank</option>{MAR_OPTIONS.map(([v2, l]) => <option key={v2} value={v2}>{l}</option>)}</select>
                                      ) : <span className="muted small">Set the times on the Medications tab</span>}
                                  </td>
                                  <td style={{ padding: 10, minWidth: 220 }}>
                                    {d ? (d.reason ?? '—') : t ? <input name={`reason|${m.id}|${t}`} aria-label={`Reason for ${m.name} at ${fmtTime(t)}`} placeholder="Why it was not given" /> : null}
                                  </td>
                                </tr>
                              );
                            });
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="row" style={{ marginTop: 12 }}>
                      <button>Save medication sheet</button>
                    </div>
                  </form>
                )}
              </section>
            )}

            {view === 'goals' && (
              <section>
                <h2 style={{ marginTop: 0 }}>🎯 Goals and the steps to reach them</h2>
                <p className="small muted">For each goal: tick steps as they are done, add steps, record today’s progress, or review the goal (progress, the child’s view, next review date).</p>
                {goals.length === 0 && <p className="muted small">No active goals. Add goals on the person’s Goals tab.</p>}
                {goals.map((g) => {
                  const gs = steps.filter((s2) => s2.goal_id === g.id);
                  return (
                    <div key={g.id} className="card" style={{ marginTop: 10 }}>
                      <h3 style={{ margin: '0 0 4px' }}>{g.title}</h3>
                      <p className="small muted" style={{ margin: 0 }}>{[g.domain, g.target_date && `target ${fmtDate(g.target_date)}`].filter(Boolean).join(' · ')}</p>
                      {g.description && <p className="small" style={{ margin: '6px 0' }}>{g.description}</p>}
                      <p className="small"><strong>Steps:</strong> {gs.filter((x) => x.done_on).length} of {gs.length} done</p>
                      <ol style={{ margin: '0 0 8px', paddingLeft: 0, listStyle: 'none' }}>
                        {gs.map((s2) => (
                          <li key={s2.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: '1px solid #eee' }}>
                            <form action={toggleGoalStep}>
                              <input type="hidden" name="id" value={s2.id} />
                              <input type="hidden" name="path" value={here('&view=goals')} />
                              <input type="hidden" name="done" value={s2.done_on ? 'no' : 'yes'} />
                              <button className="secondary">{s2.done_on ? '✓ Done' : 'Mark done'}</button>
                            </form>
                            <span className={s2.done_on ? 'muted' : ''}>{s2.step}</span>
                            {s2.done_on && <span className="muted small">{fmtDate(s2.done_on)}</span>}
                          </li>
                        ))}
                      </ol>
                      <form action={addGoalStep} className="row" style={{ gap: 8 }}>
                        <input type="hidden" name="goal_id" value={g.id} />
                        <input type="hidden" name="path" value={here('&view=goals')} />
                        <label style={{ flex: '1 1 300px' }}>New step
                          <input name="step" placeholder="Write the next step to reach this goal" />
                        </label>
                        <button className="secondary">Add step</button>
                      </form>
                      <details style={{ marginTop: 10 }}>
                        <summary><strong>Record progress today</strong></summary>
                        <div style={{ marginTop: 8 }}>
                          <RecordForm compact date={date} kind="goal_progress" homeId={house.id} residentId={resident.id} path={here('&view=goals')} goals={[g]} />
                        </div>
                      </details>
                      <details style={{ marginTop: 6 }}>
                        <summary><strong>Review this goal</strong> (progress, the child’s view, next review date)</summary>
                        <div style={{ marginTop: 8 }}>
                          <RecordForm compact date={date} kind="mcfd_care_review" homeId={house.id} residentId={resident.id} path={here('&view=goals')} goals={[g]} />
                        </div>
                      </details>
                    </div>
                  );
                })}
              </section>
            )}

            {view !== 'med' && view !== 'goals' && (() => {
              const v = VIEWS(records, house).find((x) => x.key === view) ?? VIEWS(records, house)[0];
              if (v.kind === 'nothing_to_report') {
                return (
                  <section>
                    <h2 style={{ marginTop: 0 }}>✔ Nothing to report today</h2>
                    <p className="small muted">If there was no reportable incident, physical restraint, behaviour of concern or discipline, and no serious illness or injury, tick this instead of filling those records in.</p>
                    {doneKinds.has('nothing_to_report') ? <p className="message">Recorded for {fmtDate(date)}.</p>
                      : <RecordForm compact date={date} kind="nothing_to_report" homeId={house.id} residentId={resident.id} path={here(`&view=${v.key}`)} goals={[]} />}
                  </section>
                );
              }
              const rec = records.find((r) => r.kind === v.kind);
              if (!rec || rec.tab) return <p className="card">Choose a record from the list.</p>;
              return (
                <section>
                  <h2 style={{ marginTop: 0 }}>{rec.section}</h2>
                  <p className="small muted" style={{ margin: '0 0 4px' }}>{rec.standard} · {doneKinds.has(rec.kind) ? 'Entered for this date' : 'Not yet entered for this date'}</p>
                  <p className="small" style={{ margin: '0 0 12px' }}>{rec.when}</p>
                  <RecordForm compact date={date} kind={rec.kind} homeId={house.id} residentId={resident.id} path={here(`&view=${v.key}`)} goals={goals} />
                </section>
              );
            })()}
          </div>
        </div>
      )}
    </main>
  );
}
