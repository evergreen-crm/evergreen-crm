// House directory: contacts (social worker, emergency, others) and the house's staff by role.
import { saveHouseContact, setHouseContactActive } from '@/app/homes/contact-actions';
import { KINDS } from '@/lib/houseContacts';

const LEVEL_NAME = { 3: 'Program Manager', 2: 'Program Coordinator', 1: 'Staff' };

export default function HouseDirectory({ homeId, contacts, staff, canEdit }) {
  const active = (contacts ?? []).filter((c) => c.active);
  const off = (contacts ?? []).filter((c) => !c.active);
  const byLevel = { 3: [], 2: [], 1: [] };
  for (const p of staff ?? []) (byLevel[p.level >= 3 ? 3 : p.level === 2 ? 2 : 1] ??= []).push(p);
  return (
    <>
      <h2>Contacts for this house</h2>
      {active.length === 0 && <p className="muted small">No contacts yet. Add the social worker, emergency contacts and others below.</p>}
      <table className="small">
        <thead><tr><th>Who</th><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>Notes</th></tr></thead>
        <tbody>
          {active.map((c) => (
            <tr key={c.id}>
              <td>{c.kind}</td>
              <td><strong>{c.name}</strong>{c.organisation && <div className="muted">{c.organisation}</div>}</td>
              <td>{c.phone ?? '—'}</td>
              <td>{c.email ?? '—'}</td>
              <td>{c.address ?? '—'}</td>
              <td>{c.notes ?? ''}
                {canEdit && (
                  <form action={setHouseContactActive} className="no-print">
                    <input type="hidden" name="home_id" value={homeId} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value="0" />
                    <button className="link small">Take off</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {off.length > 0 && <p className="muted small">{off.length} contact{off.length === 1 ? '' : 's'} taken off (kept for the record).</p>}

      <h2>Staff in this house</h2>
      <div className="cards">
        {[[3, 'Program Managers'], [2, 'Program Coordinators'], [1, 'Staff']].map(([lvl, title]) => (
          <section key={lvl} className="card">
            <h3>{title} ({byLevel[lvl]?.length ?? 0})</h3>
            {(byLevel[lvl] ?? []).length === 0 && <p className="muted small">None listed.</p>}
            <ul className="small">{(byLevel[lvl] ?? []).map((p) => <li key={p.id}>{p.full_name}{p.position ? ` · ${p.position}` : ''}</li>)}</ul>
          </section>
        ))}
      </div>
      <p className="muted small">Roles: {Object.values(LEVEL_NAME).join(' · ')}.</p>

      {canEdit && (
        <details className="card no-print">
          <summary><strong>+ Add a contact</strong></summary>
          <form action={saveHouseContact} className="stack">
            <input type="hidden" name="home_id" value={homeId} />
            <div className="row">
              <label>Who
                <select name="kind" required defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {KINDS.map((k) => <option key={k}>{k}</option>)}
                </select>
              </label>
              <label>Name<input name="name" required /></label>
              <label>Organisation<input name="organisation" /></label>
            </div>
            <div className="row">
              <label>Phone<input name="phone" type="tel" /></label>
              <label>Email<input name="email" type="email" /></label>
            </div>
            <label>Address<input name="address" /></label>
            <label>Notes<input name="notes" /></label>
            <button>Save contact</button>
          </form>
        </details>
      )}
    </>
  );
}
