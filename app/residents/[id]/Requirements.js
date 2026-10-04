// "Requirements" tab: MCFD / CLBC checklist for one resident.
import { programsFor, itemState } from '@/lib/requirements';
import { fmtDate, todayISO } from '@/lib/options';
import { saveRequirement } from '@/app/residents/actions';

export default async function Requirements({ supabase, resident }) {
  const { data: rows } = await supabase
    .from('resident_requirements').select('*').eq('resident_id', resident.id);
  const byKey = Object.fromEntries((rows ?? []).map((r) => [r.req_key, r]));
  const today = todayISO();
  const programs = programsFor(resident);

  // Totals for the summary bar
  let total = 0, done = 0, overdue = 0;
  for (const p of programs) for (const s of p.sections) for (const it of s.items) {
    const st = itemState(it, byKey[it.key], resident, today);
    if (!st.applies) continue;
    total++; if (st.done) done++; if (st.flag === 'overdue') overdue++;
  }

  return (
    <section>
      {!resident.admission_date && (
        <p className="alert">Add an admission date in Edit profile so due dates can be calculated.</p>
      )}
      <div className="stats">
        <div className="stat"><strong>{done} / {total}</strong><span>complete</span></div>
        <div className={`stat ${overdue ? 'bad' : ''}`}><strong>{overdue}</strong><span>overdue</span></div>
      </div>
      <p className="muted small">
        Extra items switch on when the profile says the resident is Indigenous, has a behaviour support plan, or takes medication.
      </p>

      {programs.map((p) => (
        <div key={p.key}>
          <h2>{p.label}</h2>
          {p.sections.map((s) => {
            const items = s.items.map((it) => [it, itemState(it, byKey[it.key], resident, today)]).filter(([, st]) => st.applies);
            if (items.length === 0) return null;
            return (
              <div key={s.title} className="card">
                <h3>{s.title}</h3>
                <ul className="checklist">
                  {items.map(([it, st]) => {
                    const rec = byKey[it.key];
                    return (
                      <li key={it.key} className={st.done ? 'done' : st.flag}>
                        <div className="req-text">
                          <span className="tick">{st.done ? '✓' : st.flag === 'overdue' ? '!' : '○'}</span>
                          <span>
                            {it.label}
                            <div className="muted small">
                              {st.due && (st.done && !it.every ? 'Done' : `Due ${fmtDate(st.due)}`)}
                              {it.every && ` · repeats every ${it.every >= 365 ? 'year' : it.every >= 180 ? '6 months' : '3 months'}`}
                              {rec?.completed_on && ` · last completed ${fmtDate(rec.completed_on)}`}
                              {st.flag === 'overdue' && !st.done && <span className="badge bad">Overdue</span>}
                              {st.flag === 'soon' && !st.done && <span className="badge warn">Due soon</span>}
                            </div>
                            {rec?.notes && <div className="small">{rec.notes}</div>}
                          </span>
                        </div>
                        <form action={saveRequirement} className="req-form no-print">
                          <input type="hidden" name="resident_id" value={resident.id} />
                          <input type="hidden" name="req_key" value={it.key} />
                          <select name="status" defaultValue={rec?.status ?? 'Not started'}>
                            <option>Not started</option><option>In progress</option><option>Complete</option><option>N/A</option>
                          </select>
                          <input type="date" name="completed_on" defaultValue={rec?.completed_on ?? ''} title="Date completed" />
                          <input name="notes" defaultValue={rec?.notes ?? ''} placeholder="Notes" />
                          <button className="secondary">Save</button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ))}
      <p className="muted small">
        MCFD items follow Evergreen's MCFD Residential Care Policy Manual (ECC-RC-POL-2024-001). CLBC items follow CLBC's
        Critical Incidents requirements plus Evergreen standards. Confirm against your licence and CLBC contract.
      </p>
    </section>
  );
}
