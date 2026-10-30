import { submitItem } from '@/app/onboarding/actions';
import { fmtDate, addDaysISO } from '@/lib/options';
// Six-day new staff orientation: Days 1–4 online, Days 5–6 in person. Each day is 5.5 paid hours (330 minutes)
// plus an unpaid 30-minute lunch. Items come from the orientation_plan_items table.
// Paid minutes = every item except lunch, and except the awake-night shadow shift (starts after 18:00), which is paid as a night shift.
const KIND_LABEL = { training: 'Training', quiz: 'Quiz', practical: 'In person', shift: 'Shift', admin: 'Admin', lunch: 'Lunch', external: 'External cert' };
const ONLINE_DAYS = 4; // Days 1–4 are online (Evergreen Academy); Days 5–6 are in person in the programs.

const mins = (a, b) => {
  const [h1, m1] = a.split(':').map(Number);
  const [h2, m2] = b.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
};
const isPaid = (i) => i.kind !== 'lunch' && i.start_time < '18:00';

export default function OrientationPlan({ items, sign, fullName, startDate }) {
  if (!items?.length) return null;
  const days = [...new Set(items.map((i) => i.day_number))].sort((a, b) => a - b);
  const dateOf = (d) => (startDate ? addDaysISO(startDate, d - 1) : null);
  const paidHours = (d) => (items.filter((i) => i.day_number === d && isPaid(i)).reduce((n, i) => n + mins(i.start_time, i.end_time), 0) / 60);
  const lastDay = Math.max(...days);
  const range = (a, b) => (dateOf(a) && dateOf(b) ? `${fmtDate(dateOf(a))} to ${fmtDate(dateOf(b))}` : `Day ${a}${b !== a ? ` to ${b}` : ''}`);
  const on = (d) => (dateOf(d) ? fmtDate(dateOf(d)) : `Day ${d}`);

  const CHECKLIST = [
    { text: 'Complete the online course and quizzes, pass mark 80%', when: range(1, ONLINE_DAYS) },
    { text: 'Read and sign the policies, your job description, and the supervision schedule', when: on(3) },
    { text: 'Online orientation final quiz and review (pass mark 80%)', when: on(4) },
    { text: 'Facility tour, exits, emergency procedures, Naloxone, and CPI Nonviolent Crisis Intervention (Module 1)', when: on(5) },
    { text: 'Shadow day and evening shifts with a Shift Lead', when: range(5, 6) },
    { text: 'First Aid / CPR certificate checked (full course before your first unsupervised shift)', when: on(6) },
    { text: 'Meeting with the Program Coordinator: training records and first supervision date', when: on(6) },
    { text: 'Awake-night shadow shift with the on-call leader (paid as a night shift)', when: on(lastDay) },
  ];

  return (
    <section className="card" aria-labelledby="orientation-plan-h" style={{ marginBottom: 16 }}>
      <h2 id="orientation-plan-h">Orientation plan: Days 1 to 6</h2>
      <p className="small muted">
        {`Days 1 to ${ONLINE_DAYS} are online training in the Evergreen Academy. Days ${ONLINE_DAYS + 1} to 6 are in person in the programs. Each day is 5.5 paid hours, plus a 30-minute unpaid lunch.`}
        {startDate ? ` Day 1 is ${fmtDate(startDate)}.` : ' Your dates appear once your start date is confirmed.'}
      </p>
      {days.map((d) => (
        <details key={d} open={d === 1} style={{ marginTop: 10 }}>
          <summary>
            <strong>Day {d}</strong>{' · '}{on(d)}{' · '}{d <= ONLINE_DAYS ? 'Online' : 'In person'}{' · '}
            <span className="badge">{paidHours(d).toFixed(1)} paid hours</span>
          </summary>
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
        <p className="small muted">Each item has the date it is due. Tick it as you finish it, then sign the orientation acknowledgement below.</p>
        <table className="small" style={{ marginTop: 8 }}>
          <thead><tr><th>Due</th><th>Item</th><th>Done</th></tr></thead>
          <tbody>
            {CHECKLIST.map((c, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: 'nowrap' }}>{c.when}</td>
                <td>{c.text}</td>
                <td><input type="checkbox" id={`orient-check-${i}`} aria-label={c.text} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small" style={{ marginTop: 10 }}>
          Paid orientation: {days.reduce((n, d) => n + paidHours(d), 0).toFixed(1)} hours in total across the six days.
        </p>
        {sign?.signed_at ? (
          <p className="small" style={{ marginTop: 12 }}>
            Signed as <strong>{sign.signed_name}</strong> on {new Date(sign.signed_at).toLocaleDateString('en-CA', { timeZone: 'Etc/GMT+7', year: 'numeric', month: 'short', day: 'numeric' })}.
          </p>
        ) : sign ? (
          <form action={submitItem} className="onb-form" style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={sign.id} />
            <p className="small" style={{ marginTop: 0 }}>Draw your signature at the top of your checklist first, then sign below. The date is recorded when you sign.</p>
            <label className="check"><input type="checkbox" name="agree" required /> I completed orientation, including the items above.</label>
            <label>Type your full name to sign — <strong>{fullName}</strong><input name="signed_name" required placeholder={fullName} autoComplete="off" /></label>
            <button>Sign and date</button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
