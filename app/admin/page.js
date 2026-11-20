// Admin: give each person access, turn access off, add homes and residents.
import { requireUser } from '@/lib/auth';
import { inviteUser, setUserActive, addHome, addResident, setUserLevel, setDivisionLevels, setPersonHomes } from '@/app/actions';
import { LEVELS, GROUPS, levelOf, groupOf, accessValue, personLabel } from '@/lib/levels';
import { DIVISIONS } from '@/lib/divisions';
import { getDivisionLevels } from '@/lib/portal';
import Link from 'next/link';
import StorageUsage from './StorageUsage';

// Pre-screen positions -> the pay-rate position used on the offer letter (only if that position exists).
const PS_TO_PAY = {
  'Youth Care Worker': 'Youth Worker', 'Residential Support Worker (Adults)': 'Support Worker I', 'Community Support Worker': 'Support Worker I',
  'Relief / Casual Support Worker': 'Support Worker I', 'Overnight Awake Support': 'Support Worker I', 'House Lead / Coordinator': 'Senior / Lead Support Worker',
};
function payPosition(pos, list) {
  const l = list ?? [];
  if (l.includes(pos)) return pos;
  return l.includes(PS_TO_PAY[pos]) ? PS_TO_PAY[pos] : '';
}

export default async function AdminPage({ searchParams }) {
  const { supabase, user } = await requireUser(['admin']);
  const { ok, error, from_app: fromApp, from_ps: fromPs } = await searchParams;

  const [{ data: peopleL, error: peopleErr }, { data: homes }, { data: residents }, divLevels] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, role, level, staff_group, home_id, active, homes:homes!profiles_home_id_fkey(name)').order('full_name'),
    supabase.from('homes').select('id, name').order('name'),
    supabase.from('residents').select('id, first_name, last_name, homes(name)').order('last_name'),
    getDivisionLevels(supabase),
  ]);
  const { data: positions } = await supabase.rpc('pay_positions');   // positions for the job and offer letter
  const { data: extraHomes } = await supabase.from('manager_homes').select('profile_id, home_id');
  // Hired from an online job application (plan B5): fill the form in from the application.
  const { data: hiredApps } = await supabase.from('job_applications').select('id, first_name, last_name, email, phone, answers, posting:posting_id(title, position, employment_type, hours_per_week)')
    .eq('status', 'Hired').is('profile_id', null).order('decided_at', { ascending: false }).limit(20);
  // Hired from a pre-screening file (HR pressed Hire, or the Administrator opened it from the file).
  const { data: hiredPs } = await supabase.from('prescreens').select('id, first_name, last_name, email, phone, position, program, application_no, application, hire_requested_at')
    .is('profile_id', null).eq('screen_decision', 'Passed').or(`hire_requested_at.not.is.null${/^[0-9a-f-]{36}$/i.test(fromPs ?? '') ? `,id.eq.${fromPs}` : ''}`)
    .order('hire_requested_at', { ascending: false, nullsFirst: false }).limit(20);
  const ps = (hiredPs ?? []).find((x) => x.id === fromPs) ?? null;
  const appPre = (hiredApps ?? []).find((a) => a.id === fromApp) ?? null;
  const pre = ps ? { id: ps.id, first_name: ps.first_name, last_name: ps.last_name, email: ps.email, phone: ps.phone ?? ps.application?.applicant?.phone,
    posting: { title: `pre-screen ${ps.application_no ?? ''}`.trim(), position: payPosition(ps.position, positions) } } : appPre;
  const preAddr = ps ? (ps.application?.applicant?.address ?? '') : pre ? [pre.answers?.contact?.address, pre.answers?.contact?.city, pre.answers?.contact?.postal].filter(Boolean).join(', ') : '';
  const extraBy = {};
  for (const m of extraHomes ?? []) (extraBy[m.profile_id] ??= []).push(m.home_id);
  // Before supabase/access-levels.sql is run there is no `level` column.
  // Before supabase/staff-groups.sql is run there is no `staff_group` column.
  const peopleNoGroup = peopleErr ? await supabase.from('profiles').select('id, full_name, email, phone, role, level, home_id, active, homes:homes!profiles_home_id_fkey(name)').order('full_name') : null;
  const levelsReady = !peopleErr || !peopleNoGroup?.error;
  const people = !peopleErr ? peopleL : levelsReady ? peopleNoGroup.data
    : (await supabase.from('profiles').select('id, full_name, email, phone, role, home_id, active, homes:homes!profiles_home_id_fkey(name)').order('full_name')).data;
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
      <p className="small"><Link href="/admin/import-policies">📘 Policy manual import / compress</Link> · <Link href="/admin/audit">🛡️ Security audit log</Link> · <Link href="/admin/duties">📋 Duty register &amp; levels</Link> · <Link href="/admin/access-review">🔐 Monthly access review</Link> · <Link href="/admin/go-live">🚀 Opening-day readiness</Link> · <Link href="/admin/import">📥 Staff import (Excel)</Link> · <Link href="/admin/records-download">💾 Records download</Link></p>

      {/* ---------- Give a person access ---------- */}
      {(hiredApps ?? []).length > 0 && (
        <p className="message small">💼 Hired from an online application, waiting for an account: {hiredApps.map((a, i) => <span key={a.id}>{i ? ', ' : ''}<Link href={`/admin?from_app=${a.id}#add`}>{a.first_name} {a.last_name}</Link></span>)}. Click a name to fill in the form below.</p>
      )}
      {(hiredPs ?? []).filter((x) => x.hire_requested_at).length > 0 && (
        <p className="message small">💼 Hired from pre-screening, waiting for an account: {hiredPs.filter((x) => x.hire_requested_at).map((a, i) => <span key={a.id}>{i ? ', ' : ''}<Link href={`/admin?from_ps=${a.id}#add`}>{a.first_name} {a.last_name} ({a.application_no})</Link></span>)}. Click a name to fill in the form below.</p>
      )}
      <form action={inviteUser} className="card" id="add" key={pre?.id ?? 'blank'}>
        <h2>Give a person access</h2>
        <p className="muted small">Adding many people? Use <Link href="/admin/import">Staff import</Link> with the Excel template.</p>
        {ps && <><input type="hidden" name="from_ps" value={ps.id} /><p className="message ok small">Filled in from {ps.first_name} {ps.last_name}’s screening file ({ps.application_no}, {ps.program === 'Both' ? 'MCFD and CLBC' : ps.program}). Check the access level, house and joining date. Their onboarding checklist, training plan and orientation start automatically, and their certificates go into their staff file.</p></>}
        {!ps && pre && <><input type="hidden" name="from_app" value={pre.id} /><p className="message ok small">Filled in from {pre.first_name} {pre.last_name}’s application for {pre.posting?.title}. Check the access level, house and joining date.</p></>}
        <p className="muted small">
          They sign in at the login page with a code sent to the email or cell you enter here.
        </p>
        <label>Full name<input name="full_name" required defaultValue={pre ? `${pre.first_name} ${pre.last_name ?? ''}`.trim() : undefined} /></label>
        <div className="row">
          <label>Email<input name="email" type="email" defaultValue={pre?.email ?? undefined} /></label>
          <label>Cell phone<input name="phone" type="tel" placeholder="604 555 1234" defaultValue={pre?.phone ?? undefined} /></label>
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
        <fieldset style={{ border: '1px solid var(--line, #ddd)', borderRadius: 8, padding: '8px 12px', margin: '8px 0' }}>
          <legend className="small"><strong>Job (staff)</strong>: fill these in and the offer letter is written and sent automatically</legend>
          <div className="row">
            <label>Position
              <select name="position" defaultValue={pre?.posting?.position ?? ''}>
                <option value="">—</option>
                {(positions ?? []).map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label>Full-time or part-time
              <select name="employment_type" defaultValue={['Full-time', 'Part-time'].includes(pre?.posting?.employment_type) ? pre.posting.employment_type : ''}><option value="">—</option><option>Full-time</option><option>Part-time</option></select>
            </label>
          </div>
          <div className="row">
            <label>Joining date (first day)<input name="hire_date" type="date" /></label>
            <label>Hours each week (blank = 36 full-time, 20 part-time)<input name="hours_per_week" type="number" min="1" max="60" step="0.5" defaultValue={pre?.posting?.hours_per_week ?? undefined} /></label>
          </div>
          <label>Home address (goes on the offer letter)<input name="home_address" maxLength={200} placeholder="Street, city, BC, postal code" defaultValue={preAddr || undefined} /></label>
          <p className="muted small">The letter shows the house name and address and the name of the Program Coordinator they report to, from the portal. The wage comes from <Link href="/hr/pay-rates">Pay rates</Link>. If the position has no rate yet, the letter waits and is sent the moment the rate is set. The letter needs an email address to be emailed; without one, the person sees it in the portal.</p>
        </fieldset>
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
      <table className="wide">
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
                {!(p.role === 'family' || !levelsReady) && [2, 3].includes(Number(p.level)) && (
                  <details className="small" style={{ marginTop: 6 }}>
                    <summary>Houses they can see (up to two: own home plus one)</summary>
                    <form action={setPersonHomes} className="stack small">
                      <input type="hidden" name="user_id" value={p.id} />
                      {homes?.map((h) => {
                        const own = h.id === p.home_id;
                        const on = own || (extraBy[p.id] ?? []).includes(h.id);
                        return (
                          <label key={h.id} className="check">
                            <input type="checkbox" name="home" value={h.id} defaultChecked={on} />
                            {h.name}{own ? ' (own home)' : ''}
                          </label>
                        );
                      })}
                      <button className="secondary small">Save houses</button>
                    </form>
                  </details>
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
        <table className="wide">
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
        <table className="wide">
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
