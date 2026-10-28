// 🕒 My time: sick, running late and vacation on the same page as clock in / out.
// Uses the same actions as the Absence page and the Schedule time-off tab.
import { cantMakeShift, runningLate } from '@/app/absence/actions';
import { requestTimeOff } from '@/app/schedule/teams-actions';
import { fmtDate } from '@/lib/options';

export default function MyTimeForms({ shifts = [], today }) {
  return (
    <section className="card no-print" id="my-time">
      <h2>🕒 My time</h2>
      <p className="small">Sick, running late, or vacation? Your Program Coordinator and Program Manager get an alert right away.</p>

      <h3>🤒 Sick or can’t make my shift</h3>
      {shifts.length ? (
        <form action={cantMakeShift}>
          <label className="small">Which shift
            <select name="shift_id" required>
              {shifts.map((s) => <option key={s.id} value={s.id}>{fmtDate(s.shift_date)} · {s.start_time?.slice(0, 5)} · {s.homes?.name ?? 'House'}</option>)}
            </select>
          </label>
          <input type="hidden" name="kind" value="Sick" />
          <label className="small">Note <input name="note" maxLength={300} placeholder="Optional" /></label>
          <button>Send</button>
        </form>
      ) : <p className="muted small">No shifts in the next 14 days.</p>}

      <h3>⏰ Running late</h3>
      {shifts.length ? (
        <form action={runningLate} className="row">
          <label className="small">Shift
            <select name="shift_id" required>
              {shifts.map((s) => <option key={s.id} value={s.id}>{fmtDate(s.shift_date)} · {s.start_time?.slice(0, 5)}</option>)}
            </select>
          </label>
          <label className="small">Minutes late <input name="minutes" type="number" min="1" max="240" required style={{ width: 90 }} /></label>
          <button>Send</button>
        </form>
      ) : <p className="muted small">No shifts in the next 14 days.</p>}

      <h3>🌴 Vacation and time off</h3>
      <form action={requestTimeOff} className="row">
        <label className="small">From <input type="date" name="start_date" min={today} required /></label>
        <label className="small">To <input type="date" name="end_date" min={today} /></label>
        <input type="hidden" name="kind" value="Vacation" />
        <label className="small">Note <input name="note" maxLength={300} placeholder="Optional" /></label>
        <button>Request</button>
      </form>
    </section>
  );
}
