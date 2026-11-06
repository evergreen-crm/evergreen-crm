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
  const paidHours = (d) => (items.filter((i) => i.day_number === d && isPaid(i) && i.program !== 'CLBC').reduce((n, i) => n + mins(i.start_time, i.end_time), 0) / 60);
  const lastDay = Math.max(...days);
  const range = (a, b) => (dateOf(a) && dateOf(b) ? `${fmtDate(dateOf(a))} to ${fmtDate(dateOf(b))}` : `Day ${a}${b !== a ? ` to ${b}` : ''}`);
  const on = (d) => (dateOf(d) ? fmtDate(dateOf(d)) : `Day ${d}`);

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
                  {i.quiz_no ? <strong>Quiz {i.quiz_no}: </strong> : null}{i.title}{i.program && i.program !== 'Both' ? <span className="muted"> ({i.program} houses)</span> : null}
                  {i.pass_mark ? <span className="muted"> · pass mark {i.pass_mark}%</span> : null}
                  {i.notes ? <div className="muted">{i.notes}</div> : null}
                </span>
              </li>
            ))}
          </ol>
        </details>
      ))}
      <div style={{ marginTop: 16, borderTop: '1px solid var(--line, #ddd)', paddingTop: 12 }}>
        <h3 style={{ margin: '0 0 6px' }}>Your orientation progress</h3>
        <p className="small">Track each step, start your Academy courses and see your Program Coordinator’s sign-offs in <a href="/orientation"><strong>My orientation →</strong></a>. When every step is done you get one certificate for the whole orientation.</p>
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
            <label className="check"><input type="checkbox" name="agree" required /> I completed orientation, including every step in My orientation.</label>
            <label>Type your full name to sign — <strong>{fullName}</strong><input name="signed_name" required placeholder={fullName} autoComplete="off" /></label>
            <button>Sign and date</button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
