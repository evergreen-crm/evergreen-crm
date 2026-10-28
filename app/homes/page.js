// Houses: the starting page for staff, managers and admins.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { HOUSE_TYPES, PROGRAMS } from '@/lib/options';
import { PROGRAM_DIFFERENCES } from '@/lib/programCompare';
import { createHome } from '@/app/homes/actions';

export default async function HomesPage() {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);

  const [{ data: homes }, { data: residents }] = await Promise.all([
    supabase.from('homes').select('id, name, address, house_type, program, capacity').order('name'),
    supabase.from('residents').select('home_id, status'),
  ]);

  const counts = {};
  for (const r of residents ?? []) {
    if (r.status === 'discharged') continue;
    counts[r.home_id] = (counts[r.home_id] ?? 0) + 1;
  }

  return (
    <main>
      <h1>Houses</h1>
      {homes?.length === 0 && <p className="muted">No houses yet.</p>}
      <div className="cards">
        {homes?.map((h) => (
          <div key={h.id} className="house" style={{ display: 'block' }}>
            <Link href={`/homes/${h.id}`} style={{ display: 'block' }}>
              <strong>{h.name}</strong>
              <span className="muted small">{h.address ?? 'No address'}</span>
              <span className="small">
                <span className="badge">{h.program ?? 'No program'}</span>{' '}
                <span className="badge">{h.house_type ?? 'Adults'}</span>{' '}
                {counts[h.id] ?? 0}{h.capacity ? ` / ${h.capacity}` : ''} residents
              </span>
            </Link>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }} aria-label={`${h.name} records`}>
              <Link className="button" href={`/document?house=${h.id}`}>📝 Document records</Link>
              <Link className="button secondary" href={`/homes/${h.id}?tab=records`}>By section</Link>
              {h.program === 'CLBC' && <Link className="button secondary" href={`/homes/${h.id}/daily`}>🗓 Daily grid</Link>}
              <Link className="button secondary" href={`/reports/daily?home=${h.id}`}>🖨 Report</Link>
              {!h.program && <span className="small muted">Choose MCFD or CLBC in Edit house to show the records.</span>}
            </div>
          </div>
        ))}
      </div>

      {profile.role === 'admin' && (
        <details className="card">
          <summary><strong>+ Add a house</strong></summary>
          <form action={createHome} className="stack">
            <label>House name<input name="name" required placeholder="e.g., Maple House" /></label>
            <label>Address<input name="address" /></label>
            <div className="row">
              <label>Program
                <select name="program" required defaultValue="">
                  <option value="" disabled>Choose MCFD or CLBC</option>
                  {PROGRAMS.map((t) => <option key={t} value={t}>{t === 'MCFD' ? 'MCFD — children and youth' : 'CLBC — adults'}</option>)}
                </select>
              </label>
              <label>Phone<input name="phone" type="tel" /></label>
              <label>
                Who lives here
                <select name="house_type" defaultValue="Adults">
                  {HOUSE_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label>Capacity (beds)<input name="capacity" type="number" min="1" /></label>
            </div>
            <label>Licence number<input name="licence_number" /></label>
            <details>
              <summary className="small"><strong>What is different: MCFD or CLBC house</strong></summary>
              <table className="small" style={{ marginTop: 6 }}>
                <thead><tr><th>Topic</th><th>MCFD house</th><th>CLBC house</th></tr></thead>
                <tbody>{PROGRAM_DIFFERENCES.map((d) => <tr key={d.topic}><td>{d.topic}</td><td>{d.mcfd}</td><td>{d.clbc}</td></tr>)}</tbody>
              </table>
            </details>
            <button>Add house</button>
          </form>
        </details>
      )}
    </main>
  );
}
