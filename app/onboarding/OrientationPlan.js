// Six-day new staff orientation plan, read from the orientation_plan_items table.
const KIND_LABEL = { training: 'Training', quiz: 'Quiz', practical: 'In person', shift: 'Shift', admin: 'Admin', lunch: 'Lunch', external: 'External cert' };

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
    </section>
  );
}
