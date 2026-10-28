// MCFD daily records, child by child: each record type in the MCFD standards, what was entered today, and a link to enter it.
import Link from 'next/link';
import { MCFD_RECORDS } from '@/lib/mcfdStandards';

export default function McfdDaily({ residents, todayEntries }) {
  const count = {};
  for (const e of todayEntries ?? []) {
    const k = `${e.resident_id}|${e.kind}`;
    count[k] = (count[k] ?? 0) + 1;
  }
  if (!residents?.length) return <p className="muted small">No MCFD residents in this house.</p>;
  return (
    <section>
      <h2>MCFD daily records (MCFD standards)</h2>
      <p className="muted small">For each child, enter every record below for the day. Each link opens that child’s record. Shift-level records (day book, wellness check) should be entered every day.</p>
      {residents.map((r) => {
        const name = `${r.preferred_name || r.first_name} ${r.last_name}`;
        const done = MCFD_RECORDS.filter((rec) => rec.kind === 'day_book' || rec.kind === 'wellness_check').every((rec) => count[`${r.id}|${rec.kind}`]);
        return (
          <details key={r.id} className="card" open={!done}>
            <summary><strong>{name}</strong> <span className={done ? 'badge' : 'badge warn'}>{done ? 'Day book and wellness check done today' : 'Day book or wellness check still to do today'}</span></summary>
            <table className="small">
              <thead><tr><th>Record (section)</th><th>Standard</th><th>When to enter</th><th>Entered today</th><th></th></tr></thead>
              <tbody>
                {MCFD_RECORDS.map((rec) => {
                  const n = count[`${r.id}|${rec.kind}`] ?? 0;
                  const href = rec.tab ? `/residents/${r.id}?tab=${rec.tab}` : `/residents/${r.id}?tab=logs&type=${rec.kind}`;
                  return (
                    <tr key={rec.kind}>
                      <td>{rec.section}</td>
                      <td>{rec.standard}</td>
                      <td>{rec.when}</td>
                      <td>{rec.tab ? '—' : n}</td>
                      <td><Link className="button secondary" href={href}>{rec.tab ? 'Open MAR' : n ? 'Add another' : 'Enter'}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        );
      })}
    </section>
  );
}
