// "Your night duties": shown on the phone during an awake or sleep night shift.
import { nightDutiesFor } from '@/lib/nightDuties';

export default function NightDuties({ shift }) {
  const d = nightDutiesFor(shift?.label);
  if (!d) return null;
  const program = shift.program;
  return (
    <details className="card" open>
      <summary><strong>🌙 {d.title}</strong>{shift.night_role ? <span className="muted small"> · {shift.night_role}</span> : null}</summary>
      <p className="small muted">Start of shift</p>
      <ul className="small">{d.start.map((x) => <li key={x}>{x}</li>)}</ul>
      <p className="small muted">Through the night</p>
      <ul className="small">{d.through.map((x) => <li key={x}>{x}</li>)}</ul>
      <p className="small muted">End of shift</p>
      <ul className="small">{d.end.map((x) => <li key={x}>{x}</li>)}</ul>
      <p className="small">{program === 'MCFD' && d.mcfd ? d.mcfd : program === 'CLBC' && d.clbc ? d.clbc : [d.mcfd, d.clbc].filter(Boolean).join(' ')}</p>
    </details>
  );
}
