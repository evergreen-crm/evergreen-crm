// Side panel: every record the house keeps (by section), for each current resident.
// Enter any record for any date and time. The entry form has its own date and time boxes.
import Link from 'next/link';
import { isDaily } from '@/lib/records';
import { ENTRY_TYPES } from '@/lib/entries';
import { fmtDate } from '@/lib/options';
import RecordForm from '@/app/components/RecordForm';

// One line for a saved entry: date, time, and its summary.
const line = (e) => {
  let text = '';
  try { text = ENTRY_TYPES[e.kind]?.summary?.(e.data ?? {}) ?? ''; } catch { text = ''; }
  return `${fmtDate(e.entry_date)}${e.entry_time ? ` ${e.entry_time.slice(0, 5)}` : ''}${text ? ` · ${text}` : ''}`;
};

export default function HouseRecords({ layout = 'side', homeId, program, records, residents, todayEntries, recent = [] }) {
  const wrap = layout === 'full' ? { width: '100%' } : { flex: '0 1 380px', minWidth: 280, position: 'sticky', top: 12 };
  const last = {};
  for (const e of recent) {
    const k = `${e.resident_id}|${e.kind}`;
    (last[k] ??= []).length < 3 && last[k].push(e);
  }
  if (!records.length) {
    return (
      <aside aria-label="House records" style={{ flex: '0 1 380px', minWidth: 280 }}>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>House records by section</h2>
          <p className="small">This house has no program yet, so its records are not shown. Use <strong>Edit house</strong> and choose MCFD or CLBC.</p>
        </section>
      </aside>
    );
  }
  const count = {};
  for (const e of todayEntries ?? []) {
    const k = `${e.resident_id}|${e.kind}`;
    count[k] = (count[k] ?? 0) + 1;
  }
  const dailyKinds = records.filter(isDaily).map((r) => r.kind);
  return (
    <aside aria-label={`${program} records`} className="doc-form" style={wrap}>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{program} records by section</h2>
        <div className="message" style={{ marginBottom: 8 }}>
          <strong>How to enter a record:</strong> 1. Find the child below. 2. Open the record you need (“Write … here”). 3. Fill in the required fields (the first group). 4. Check the date and time at the bottom, change them if the entry is for another time. 5. Press Save. The entry appears under that record straight away.
        </div>
        <p className="small" style={{ margin: '0 0 6px' }}><Link href={`/homes/${homeId}/daily`}><strong>🗓 Daily grid (enter every child, one screen)</strong></Link> · <Link href="/documentation">📝 Documentation guide</Link> · <Link href="/reports/daily">🖨 Print a report</Link></p>
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
                        <Link className="button secondary" href={href}>{rec.tab ? 'Open MAR' : 'Full page'}</Link>
                        {!rec.tab && <span className="small">{n} today</span>}
                      </div>
                      {!rec.tab && (
                        <details style={{ marginTop: 6 }}>
                          <summary className="small"><strong>Write {rec.section.toLowerCase()} here</strong></summary>
                          <div style={{ marginTop: 6 }}>
                            <RecordForm compact kind={rec.kind} homeId={homeId} residentId={r.id} path={`/homes/${homeId}`} goals={[]} />
                          </div>
                        </details>
                      )}
                      {!rec.tab && (last[`${r.id}|${rec.kind}`] ?? []).length > 0 && (
                        <ul className="small muted" style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                          {last[`${r.id}|${rec.kind}`].map((e) => <li key={e.id}>{line(e)}</li>)}
                        </ul>
                      )}
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
