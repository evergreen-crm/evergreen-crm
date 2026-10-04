// Admin: give each person access, turn access off, add homes and residents.
import { requireUser } from '@/lib/auth';
import { inviteUser, setUserActive, addHome, addResident } from '@/app/actions';

export default async function AdminPage({ searchParams }) {
  const { supabase, user } = await requireUser(['admin']);
  const { ok, error } = await searchParams;

  const [{ data: people }, { data: homes }, { data: residents }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, role, active, homes(name)').order('full_name'),
    supabase.from('homes').select('id, name').order('name'),
    supabase.from('residents').select('id, first_name, last_name').order('last_name'),
  ]);

  return (
    <main>
      <h1>Admin</h1>
      {ok && <p className="message ok">{ok}</p>}
      {error && <p className="message">{error}</p>}

      {/* ---------- Give a person access ---------- */}
      <form action={inviteUser} className="card">
        <h2>Give a person access</h2>
        <p className="muted small">
          They sign in at the login page with a code sent to the email or cell you enter here.
        </p>
        <label>Full name<input name="full_name" required /></label>
        <div className="row">
          <label>Email<input name="email" type="email" /></label>
          <label>Cell phone<input name="phone" type="tel" placeholder="604 555 1234" /></label>
        </div>
        <div className="row">
          <label>
            Role
            <select name="role" required defaultValue="staff">
              <option value="staff">Staff</option>
              <option value="manager">Manager (all homes)</option>
              <option value="family">Family (one resident)</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Home (staff)
            <select name="home_id" defaultValue="">
              <option value="">—</option>
              {homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label>
            Resident (family)
            <select name="resident_id" defaultValue="">
              <option value="">—</option>
              {residents?.map((r) => <option key={r.id} value={r.id}>{r.first_name} {r.last_name}</option>)}
            </select>
          </label>
          <label>Relationship (family)<input name="relationship" placeholder="e.g., daughter" /></label>
        </div>
        <button>Give access</button>
      </form>

      {/* ---------- Everyone with access ---------- */}
      <h2>People</h2>
      <table>
        <thead>
          <tr><th>Name</th><th>Role</th><th>Home</th><th>Email / cell</th><th>Access</th></tr>
        </thead>
        <tbody>
          {people?.map((p) => (
            <tr key={p.id} className={p.active ? '' : 'inactive'}>
              <td>{p.full_name}</td>
              <td>{p.role}</td>
              <td>{p.homes?.name ?? '—'}</td>
              <td className="small">{[p.email, p.phone].filter(Boolean).join(' · ')}</td>
              <td>
                {p.id === user.id ? (
                  <span className="muted small">You</span>
                ) : (
                  <form action={setUserActive}>
                    <input type="hidden" name="user_id" value={p.id} />
                    <input type="hidden" name="active" value={p.active ? 'false' : 'true'} />
                    <button className={p.active ? 'danger' : 'secondary'}>
                      {p.active ? 'Turn off' : 'Turn on'}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---------- Homes & residents ---------- */}
      <div className="grid2">
        <form action={addHome} className="card">
          <h2>Add a home</h2>
          <label>Name<input name="name" required /></label>
          <label>Address<input name="address" /></label>
          <label>Licence number<input name="licence_number" /></label>
          <button>Add home</button>
        </form>

        <form action={addResident} className="card">
          <h2>Add a resident</h2>
          <label>
            Home
            <select name="home_id" required defaultValue="">
              <option value="" disabled>Pick a home</option>
              {homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <div className="row">
            <label>First name<input name="first_name" required /></label>
            <label>Last name<input name="last_name" required /></label>
          </div>
          <div className="row">
            <label>Date of birth<input name="date_of_birth" type="date" /></label>
            <label>Admission date<input name="admission_date" type="date" /></label>
          </div>
          <label>Allergies<input name="allergies" /></label>
          <button>Add resident</button>
        </form>
      </div>
    </main>
  );
}
