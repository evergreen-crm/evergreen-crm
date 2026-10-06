// Admin: give each person access, turn access off, add homes and residents.
import { requireUser } from '@/lib/auth';
import { inviteUser, setUserActive, addHome, addResident, setUserLevel, setDivisionLevels } from '@/app/actions';
import { LEVELS, GROUPS, levelOf, groupOf, accessValue, personLabel } from '@/lib/levels';
import { DIVISIONS } from '@/lib/divisions';
import { getDivisionLevels } from '@/lib/portal';
import Link from 'next/link';
import StorageUsage from './StorageUsage';

export default async function AdminPage({ searchParams }) {
  const { supabase, user } = await requireUser(['admin']);
  const { ok, error } = await searchParams;

  const [{ data: peopleL, error: peopleErr }, { data: homes }, { data: residents }, divLevels] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, role, level, staff_group, home_id, active, homes(name)').order('full_name'),
    supabase.from('homes').select('id, name').order('name'),
    supabase.from('residents').select('id, first_name, last_name, homes(name)').order('last_name'),
    getDivisionLevels(supabase),
  ]);
  // Before supabase/access-levels.sql is run there is no `level` column.
  // Before supabase/staff-groups.sql is run there is no `staff_group` column.
  const peopleNoGroup = peopleErr ? await supabase.from('profiles').select('id, full_name, email, phone, role, level, home_id, active, homes(name)').order('full_name') : null;
  const levelsReady = !peopleErr || !peopleNoGroup?.error;
  const people = !peopleErr ? peopleL : levelsReady ? peopleNoGroup.data
    : (await supabase.from('profiles').select('id, full_name, email, phone, role, home_id, active, homes(name)').order('full_name')).data;
  const LevelOptions = () => (<>
    {LEVELS.map((l) => <option key={l.level} value={l.level}>{l.level} · {l.name}</option>)}
    <optgroup label="Departments (all homes, no resident records)">
      {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
    </optgroup>
  </>);

  return (
    <main>
      <h1>Admin</h1>
      {ok && <p className="message ok">{ok}</p>}
      {error && <p className="message">{error}</p>}

      <StorageUsage supabase={supabase} />
      <p className="small"><Link href="/admin/import-policies">📘 Policy manual import / compress</Link></p>

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
            Access level
            <select name="level" required defaultValue="1">
              <LevelOptions />
              <option value="family">Family (one resident)</option>
            </select>
          </label>
          <label>
            Home (levels 1–2; not HR / Payroll)
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
              {residents?.map((r) => <option key={r.id} value={r.id}>{r.first_name} {r.last_name}{r.homes?.name ? ` · ${r.homes.name}` : ''}</option>)}
            </select>
          </label>
          <label>Relationship (family)<input name="relationship" placeholder="e.g., daughter" /></label>
        </div>
        <button>Give access</button>
      </form>

      {/* ---------- Everyone with access ---------- */}
      <h2 id="people">People</h2>
      {!levelsReady && (
        <p className="message">Run <code>supabase/access-levels.sql</code> in Supabase → SQL Editor to switch on access levels 1–8.</p>
      )}
      <table>
        <thead>
          <tr><th>Name</th><th>Level</th><th>Home</th><th>Email / cell</th><th>Access</th></tr>
        </thead>
        <tbody>
          {people?.map((p) => (
            <tr key={p.id} className={p.active ? '' : 'inactive'}>
              <td>{p.full_name}</td>
              <td>
                {p.role === 'family' || !levelsReady ? personLabel(p) : (
                  <form action={setUserLevel} className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="hidden" name="user_id" value={p.id} />
                    <select name="level" defaultValue={accessValue(p)} aria-label={`Level for ${p.full_name}`}><LevelOptions /></select>
                    <select name="home_id" defaultValue={p.home_id ?? ''} aria-label={`Home for ${p.full_name}`}>
                      <option value="">All homes / none</option>
                      {homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                    <button className="secondary small">Save</button>
                  </form>
                )}
              </td>
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

      {/* ---------- Access levels ---------- */}
      <section className="card" id="levels">
        <h2>Access levels</h2>
        <p className="muted small">Each person has one level — their security level. Levels 1–2 see their own home, 3–7 see all homes, 8 can do everything including giving access. Move anyone with the Level menu above.</p>
        <table>
          <thead><tr><th>Level</th><th>Group</th><th>What it’s for</th><th>People</th></tr></thead>
          <tbody>
            {LEVELS.map((l) => (
              <tr key={l.level}><td>{l.level}</td><td><strong>{l.name}</strong></td><td className="small">{l.hint}</td>
                <td>{people?.filter((p) => p.active && p.role !== 'family' && !groupOf(p) && levelOf(p) === l.level).length ?? 0}</td></tr>
            ))}
            {GROUPS.map((g) => (
              <tr key={g.key}><td>—</td><td><strong>{g.name}</strong></td><td className="small">{g.hint}</td>
                <td>{people?.filter((p) => p.active && groupOf(p) === g.key).length ?? 0}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <form action={setDivisionLevels} className="card" id="divisions">
        <h2>Portal divisions by level</h2>
        <p className="muted small">A division opens automatically for everyone at or above its level. “Edit everyone’s records” is the level that can also change other people’s records. You can still add one-off people on a division’s “Who has access”.</p>
        <table>
          <thead><tr><th>Division</th><th>Can see and add</th><th>Can edit everyone’s records</th></tr></thead>
          <tbody>
            {DIVISIONS.map((d) => {
              const dl = divLevels[d.key] ?? { view_level: 8, edit_level: 8 };
              return (
                <tr key={d.key}>
                  <td>{d.icon} {d.num}. {d.title}</td>
                  <td><select name={`view_${d.key}`} defaultValue={dl.view_level}>{LEVELS.map((l) => <option key={l.level} value={l.level}>{l.level} · {l.name} and up</option>)}</select></td>
                  <td><select name={`edit_${d.key}`} defaultValue={dl.edit_level}>{LEVELS.map((l) => <option key={l.level} value={l.level}>{l.level} · {l.name} and up</option>)}</select></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button disabled={!levelsReady}>Save division levels</button>
      </form>

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
