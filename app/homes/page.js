// Houses: the starting page for staff, managers and admins.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { HOUSE_TYPES } from '@/lib/options';
import { createHome } from '@/app/homes/actions';

export default async function HomesPage() {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);

  const [{ data: homes }, { data: residents }] = await Promise.all([
    supabase.from('homes').select('id, name, address, house_type, capacity').order('name'),
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
          <Link key={h.id} href={`/homes/${h.id}`} className="house">
            <strong>{h.name}</strong>
            <span className="muted small">{h.address ?? 'No address'}</span>
            <span className="small">
              <span className="badge">{h.house_type ?? 'Adults'}</span>{' '}
              {counts[h.id] ?? 0}{h.capacity ? ` / ${h.capacity}` : ''} residents
            </span>
          </Link>
        ))}
      </div>

      {profile.role === 'admin' && (
        <details className="card">
          <summary><strong>+ Add a house</strong></summary>
          <form action={createHome} className="stack">
            <label>House name<input name="name" required placeholder="e.g., Maple House" /></label>
            <label>Address<input name="address" /></label>
            <div className="row">
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
            <button>Add house</button>
          </form>
        </details>
      )}
    </main>
  );
}
