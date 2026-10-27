// Six-day new staff orientation plan, read from the orientation_plan_items table.
const KIND_LABEL = { training: 'Training', quiz: 'Quiz', practical: 'In person', shift: 'Shift', admin: 'Admin', lunch: 'Lunch', external: 'External cert' };


const CHECKLIST = [
  'Completed all training videos and passed each quiz (pass mark 80%)',
  'Completed Naloxone, CPI Nonviolent Crisis Intervention, and First Aid / CPR',
  'Signed the policies and the job description',
  'Shadowed a day shift and an evening shift with a Shift Lead',
  'Completed the awake-night shadow shift',
  'Met with the Program Coordinator to review training records',
];

export default function OrientationPlan({ items }) {
  if (!items?.length) return null;
  const days = [...new Set(items.map((i) => i.day_number))].sort((a, b) => a - b);
  return (
    <section className="card" aria-labelledby="orientation-plan-h" style={{ marginBottom: 16 }}>
      <h2 id="orientation-plan-h">Orientation plan: Days 1 to 6</h2>
      <p className="small muted">Follow this schedule during your first week. Lunch is included in each day.</p>
      {days.map((d) => (
        <details key={d} open={d === 1} style={{ marginTop: 10 }}>
          <summary><strong>Day {d}</strong></summary>
          <ol style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
            {items.filter((i) => i.day_number === d).sort((a, b) => a.sort - b.sort).map((i) => (
              <li key={i.id} className="small" style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, padding: '6px 0', borderTop: '1px solid var(--line, #ddd)' }}>
                <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{i.start_time}–{i.end_time}</span>
                <span>
                  <span className={`badge ${i.kind === 'lunch' ? '' : i.kind === 'quiz' ? 'warn' : ''}`} style={{ marginRight: 6 }}>{KIND_LABEL[i.kind] ?? i.kind}</span>
                  {i.quiz_no ? <strong>Quiz {i.quiz_no}: </strong> : null}{i.title}
                  {i.pass_mark ? <span className="muted"> · pass mark {i.pass_mark}%</span> : null}
                  {i.notes ? <div className="muted">{i.notes}</div> : null}
                </span>
              </li>
            ))}
          </ol>
        </details>
      ))}
      <div style={{ marginTop: 16, borderTop: '1px solid var(--line, #ddd)', paddingTop: 12 }}>
        <h3 style={{ margin: '0 0 6px' }}>Orientation checklist</h3>
        <p className="small muted">Tick each item as you finish it. Then sign the Orientation acknowledgement in your checklist below.</p>
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {CHECKLIST.map((c, i) => (
            <li key={i} style={{ padding: '4px 0' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <input type="checkbox" id={`orient-check-${i}`} style={{ marginTop: 4 }} />
                <span>{c}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
