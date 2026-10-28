// Side panel: every record the house keeps (by section), for each current resident.
// Enter any record for any date and time. The entry form has its own date and time boxes.
import Link from 'next/link';
import { isDaily } from '@/lib/records';

export default function HouseRecords({ program, records, residents, todayEntries }) {
  const count = {};
  for (const e of todayEntries ?? []) {
    const k = `${e.resident_id}|${e.kind}`;
    count[k] = (count[k] ?? 0) + 1;
  }
  const dailyKinds = records.filter(isDaily).map((r) => r.kind);
  return (
    <aside aria-label={`${program} records`} style={{ flex: '0 1 380px', minWidth: 280, position: 'sticky', top: 12 }}>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{program} records by section</h2>
        <p className="muted small">Every record for each child. Open a record, then set the date and time on the form, so an entry can be made for any date or time today or on an earlier day.</p>
        {!residents?.length && <p className="muted small">No current residents in this house yet.</p>}
        {residents?.map((r) => {
          const name = `${r.preferred_name || r.first_name} ${r.last_name}`;
          const done = dailyKinds.every((k) => count[`${r.id}|${k}`]);
          return (
            <details key={r.id} style={{ marginTop: 8 }} open={!done}>
              <summary>
                <strong>{name}</strong>{' '}
                <span className={done ? 'badge' : 'badge warn'}>{done ? 'Daily records done today' : 'Daily records to do today'}</span>
              </summary>
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                {records.map((rec) => {
                  const n = count[`${r.id}|${rec.kind}`] ?? 0;
                  const href = rec.tab ? `/residents/${r.id}?tab=${rec.tab}` : `/residents/${r.id}/forms/${rec.kind}`;
                  return (
                    <li key={rec.kind} style={{ borderTop: '1px solid var(--line, #ddd)', padding: '6px 0' }}>
                      <div><strong>{rec.section}</strong></div>
                      <div className="muted small">{rec.standard}</div>
                      <div className="small">{rec.when}</div>
                      <div className="row" style={{ alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <Link className="button secondary" href={href}>{rec.tab ? 'Open MAR' : 'Open form'}</Link>
                        {!rec.tab && <span className="small">{n} today</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </section>
    </aside>
  );
}
