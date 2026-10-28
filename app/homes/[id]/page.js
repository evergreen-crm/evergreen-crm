// One house: its residents, upcoming calendar, and house details (editable).
import Link from 'next/link';
import UseMyLocation from './UseMyLocation';
import FindAddress from './FindAddress';
import HouseDashboard from './HouseDashboard';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { HOUSE_TYPES, PROGRAMS, fmtDate, fmtTime, todayISO, age, daysUntil } from '@/lib/options';
import { PROGRAM_DIFFERENCES } from '@/lib/programCompare';
import { updateHome } from '@/app/homes/actions';
import EntryForm from '@/app/components/EntryForm';
import HouseDirectory from '@/app/homes/HouseDirectory';
import { levelOf } from '@/lib/levels';
import RecordChecks from '@/app/homes/RecordChecks';
import EntryList from '@/app/components/EntryList';
import HouseRecords from '@/app/homes/HouseRecords';
import { recordsFor } from '@/lib/records';

export default async function HomePage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { edit, tab = 'dashboard' } = sp;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const canEdit = ['admin', 'manager'].includes(profile.role);

  const { data: houseResidents } = await supabase.from('residents')
    .select('id, first_name, last_name, preferred_name, status, on_medication, emergency_contact_name, emergency_contact_phone, doctor_name, allergies, care_plan_review_date, guardian_name, guardian_phone')
    .eq('home_id', id).neq('status', 'discharged');
  const { data: houseMeds } = await supabase.from('medications').select('resident_id, name, dose, route, prescriber, active').eq('active', true)
    .in('resident_id', (houseResidents ?? []).map((r) => r.id).length ? (houseResidents ?? []).map((r) => r.id) : ['00000000-0000-0000-0000-000000000000']);
  const { data: houseContacts } = await supabase.from('house_contacts').select('*').eq('home_id', id).order('kind');
  const { data: houseStaff } = await supabase.from('profiles').select('id, full_name, level, role, staff_group').eq('home_id', id).eq('active', true).is('staff_group', null).order('full_name');
  const { data: houseMgrs } = await supabase.from('manager_homes').select('profiles(id, full_name, level, role, active, staff_group)').eq('home_id', id);
  const staffList = [...(houseStaff ?? []), ...(houseMgrs ?? []).map((m) => m.profiles).filter((p) => p && p.active && !p.staff_group)]
    .filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i)
    .map((p) => ({ ...p, level: p.role === 'admin' ? 8 : levelOf(p) }));
  const canDirectory = profile.role === 'admin' || levelOf(profile) >= 3 || (levelOf(profile) === 2 && profile.home_id === id);

  const today = todayISO();
  const [{ data: home }, { data: residents }, { data: appts }, { data: allHomes }] = await Promise.all([
    supabase.from('homes').select('*').eq('id', id).maybeSingle(),
    supabase.from('residents')
      .select('id, first_name, last_name, preferred_name, date_of_birth, care_type, status, allergies, care_plan_review_date')
      .eq('home_id', id).order('last_name'),
    supabase.from('appointments')
      .select('id, title, category, appt_date, start_time, status, residents(first_name, last_name)')
      .eq('home_id', id).gte('appt_date', today).neq('status', 'Cancelled')
      .order('appt_date').order('start_time').limit(8),
    supabase.from('homes').select('id, name').order('name'),
  ]);
  if (!home) notFound();

  const path = `/homes/${id}`;
  const isAdmin = profile.role === 'admin';
  const kinds = tab === 'commbook' ? ['commbook'] : tab === 'safety' ? ['fire_drill', 'safety_check'] : null;
  const { data: houseEntries } = kinds
    ? await supabase.from('entries').select('*, author:created_by(full_name)').eq('home_id', id).in('kind', kinds)
      .order('entry_date', { ascending: false }).order('entry_time', { ascending: false, nullsFirst: false }).limit(150)
    : { data: null };
  const { data: lastDrill } = await supabase.from('entries').select('entry_date')
    .eq('home_id', id).eq('kind', 'fire_drill').order('entry_date', { ascending: false }).limit(1).maybeSingle();
  const drillThisMonth = lastDrill?.entry_date?.slice(0, 7) === today.slice(0, 7);
  // Records for this house's program (MCFD or CLBC), and what has been entered today, for the side panel.
  const records = recordsFor(home.program);
  const recordKinds = records.filter((r) => !r.tab).map((r) => r.kind);
  // The last few entries of each record kind, shown under each record on the side panel.
  const { data: recentRows } = records.length
    ? await supabase.from('entries').select('id, resident_id, kind, entry_date, entry_time, data').eq('home_id', id)
      .in('kind', recordKinds).order('entry_date', { ascending: false }).order('entry_time', { ascending: false, nullsFirst: false }).limit(800)
    : { data: null };
  const { data: todayRecords } = records.length
    ? await supabase.from('entries').select('resident_id, kind').eq('home_id', id).eq('entry_date', today).in('kind', recordKinds)
    : { data: null };
  const TABS = [['dashboard', '📊 Dashboard'], ['residents', 'Residents'], ['commbook', 'Shift log'], ['safety', 'Fire drills & safety'],
    ...(records.length ? [['records', '📝 Records by section']] : [])];

  const current = residents?.filter((r) => r.status !== 'discharged') ?? [];
  const past = residents?.filter((r) => r.status === 'discharged') ?? [];

  return (
    <main>
      <p className="small"><Link href="/homes">← All houses</Link></p>
      <div className="title-row">
        <h1>{home.name}</h1>
        {canEdit && !edit && <Link className="button secondary" href={`/homes/${id}?edit=1`}>Edit house</Link>}
      </div>
      <p className="muted">
        <span className="badge">{home.program ?? 'No program yet'}</span>{' '}
        <span className="badge">{home.house_type ?? 'Adults'}</span>{' '}
        {[home.address, home.phone, home.licence_number && `Licence ${home.licence_number}`].filter(Boolean).join(' · ')}
      </p>

      {edit && canEdit && (
        <form action={updateHome} className="card">
          <h2>Edit house</h2>
          <input type="hidden" name="id" value={home.id} />
          <label>House name<input name="name" required defaultValue={home.name} /></label>
          <label>Address<input name="address" defaultValue={home.address ?? ''} /></label>
          <div className="row">
            <label>Phone<input name="phone" type="tel" inputMode="tel" defaultValue={home.phone ?? ''} /></label>
            <label>On-call phone (for the 🆘 button)<input name="on_call_phone" type="tel" inputMode="tel" defaultValue={home.on_call_phone ?? ''} placeholder="Manager on-call cell" /></label>
            <label>Program
              <select name="program" required defaultValue={home.program ?? ''}>
                <option value="" disabled>Choose MCFD or CLBC</option>
                {PROGRAMS.map((t) => <option key={t} value={t}>{t === 'MCFD' ? 'MCFD — children and youth' : 'CLBC — adults'}</option>)}
              </select>
            </label>
            <label>
              Who lives here
              <select name="house_type" defaultValue={home.house_type ?? 'Adults'}>
                {HOUSE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label>Capacity<input type="number" min="1" name="capacity" defaultValue={home.capacity ?? ''} /></label>
          </div>
          <label>Licence number<input name="licence_number" defaultValue={home.licence_number ?? ''} /></label>
          <details>
            <summary className="small"><strong>What is different: MCFD or CLBC house</strong></summary>
            <table className="small" style={{ marginTop: 6 }}>
              <thead><tr><th>Topic</th><th>MCFD house</th><th>CLBC house</th></tr></thead>
              <tbody>{PROGRAM_DIFFERENCES.map((d) => <tr key={d.topic}><td>{d.topic}</td><td>{d.mcfd}</td><td>{d.clbc}</td></tr>)}</tbody>
            </table>
          </details>
          <fieldset className="card">
            <legend>House location — staff can clock in and out only here</legend>
            <div className="row">
              <label>Latitude<input name="lat" inputMode="decimal" defaultValue={home.lat ?? ''} placeholder="49.2827" /></label>
              <label>Longitude<input name="lng" inputMode="decimal" defaultValue={home.lng ?? ''} placeholder="-123.1207" /></label>
              <label>Counts as “at the house” within (metres)<input type="number" min="25" max="2000" name="geofence_m" defaultValue={home.geofence_m ?? 100} /></label>
            </div>
            <div className="row" style={{ gap: 8 }}><FindAddress /><UseMyLocation /></div>
            {home.lat != null && <p className="small"><a href={`https://maps.google.com/?q=${home.lat},${home.lng}`} target="_blank" rel="noreferrer">📍 See the saved pin on the map</a></p>}
            <p className="muted small">Most precise: stand at the front door and tap “Use my current location”. Or type the address above and tap “Find from address”. 100 m works well; phones indoors can be 20–60 m off, so don’t go below about 75 m.</p>
          </fieldset>
          <label>Notes<textarea name="notes" rows={2} defaultValue={home.notes ?? ''} /></label>
          <div className="row">
            <button>Save</button>
            <Link className="button secondary" href={`/homes/${id}`}>Cancel</Link>
          </div>
        </form>
      )}

      {!drillThisMonth && <p className="alert">No fire drill recorded yet this month{lastDrill ? ` (last one ${fmtDate(lastDrill.entry_date)})` : ''}.</p>}
      <div className="card no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <strong>Documentation:</strong>
        <Link className="button" href={`/document?house=${id}`}>📝 Document records</Link>
        <Link className="button secondary" href={`/homes/${id}?tab=records`}>Records by section</Link>
        {home.program === 'CLBC' && <Link className="button secondary" href={`/homes/${id}/daily`}>🗓 Daily grid</Link>}
        <Link className="button secondary" href={`/reports/daily?home=${id}`}>🖨 Print report</Link>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 480px', minWidth: 0 }}>
      <nav className="tabs-bar no-print">
        {TABS.map(([k, label]) => <Link key={k} href={`${path}?tab=${k}`} className={tab === k ? 'on' : ''}>{label}</Link>)}
        <Link href={`/schedule?home=${id}`}>Schedule →</Link>
      </nav>

      {tab === 'dashboard' && !edit && (
        <HouseDashboard supabase={supabase} profile={profile} userId={user.id} home={home} homes={allHomes ?? []} sp={sp} />
      )}

      {tab === 'commbook' && (
        <section>
          <p className="muted small">Read this at the start of every shift. Important messages stay highlighted.</p>
          <EntryForm kind="commbook" homeId={id} path={path} title="Write in the communication book" open />
          <EntryList entries={houseEntries} path={path} isAdmin={isAdmin} empty="No messages yet." />
        </section>
      )}

      {tab === 'records' && (
        <HouseRecords layout="full" homeId={id} program={home.program} records={records} residents={current} todayEntries={todayRecords ?? []} recent={recentRows ?? []} />
      )}

      {tab === 'safety' && (
        <section>
          <p className="muted small">Fire drills: at least once a month, including some during sleeping hours. Record every safety check and any repairs needed.</p>
          <EntryForm kind="fire_drill" homeId={id} path={path} title="Record a fire drill" />
          <EntryForm kind="safety_check" homeId={id} path={path} title="Record a safety check" />
          <EntryList entries={houseEntries} path={path} isAdmin={isAdmin} empty="No drills or checks recorded yet." />
        </section>
      )}

      {tab === 'residents' && <>
      {/* ---------- Residents ---------- */}
      <div className="title-row">
        <p className="small"><Link href={`/homes/${id}/activities`}>📅 Activity plan</Link> · <Link href="/documentation">📝 What to document each shift</Link></p>

        <RecordChecks homeId={id} program={home.program} residents={houseResidents ?? []} meds={houseMeds ?? []} />

        <HouseDirectory homeId={id} contacts={houseContacts ?? []} staff={staffList} canEdit={canDirectory} />

        <h2>Residents ({current.length}{home.capacity ? ` of ${home.capacity}` : ''})</h2>
        {canEdit && <Link className="button" href={`/residents/new?home=${id}`}>+ Add resident</Link>}
      </div>
      {current.length === 0 && <p className="muted">No residents in this house yet.</p>}
      <ul className="list">
        {current.map((r) => {
          const review = daysUntil(r.care_plan_review_date);
          return (
            <li key={r.id}>
              <Link href={`/residents/${r.id}`}>
                <span>
                  <strong>{r.first_name} {r.last_name}</strong>
                  {r.preferred_name && <span className="muted"> ("{r.preferred_name}")</span>}
                  <span className="muted small"> · {r.care_type ?? 'Adult'}{r.date_of_birth ? `, age ${age(r.date_of_birth)}` : ''}</span>
                </span>
                <span className="small">
                  {r.status !== 'active' && <span className="badge warn">{r.status}</span>}{' '}
                  {r.allergies && <span className="badge bad">Allergies</span>}{' '}
                  {review !== null && review < 0 && <span className="badge bad">Care plan review overdue</span>}
                  {review !== null && review >= 0 && review <= 30 && <span className="badge warn">Care plan review in {review}d</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {past.length > 0 && (
        <details>
          <summary className="muted small">Discharged ({past.length})</summary>
          <ul className="list">
            {past.map((r) => (
              <li key={r.id}><Link href={`/residents/${r.id}`}>{r.first_name} {r.last_name}</Link></li>
            ))}
          </ul>
        </details>
      )}

      {/* ---------- Upcoming ---------- */}
      <div className="title-row">
        <h2>Coming up</h2>
        <Link className="button secondary" href={`/calendar?home=${id}`}>Open calendar</Link>
      </div>
      {appts?.length === 0 && <p className="muted">Nothing scheduled.</p>}
      <ul className="agenda">
        {appts?.map((a) => (
          <li key={a.id}>
            <span className="when">{fmtDate(a.appt_date)}{a.start_time && ` · ${fmtTime(a.start_time)}`}</span>
            <span><strong>{a.title}</strong>
              <span className="muted small"> · {a.category}{a.residents ? ` · ${a.residents.first_name} ${a.residents.last_name}` : ' · Whole house'}</span>
            </span>
          </li>
        ))}
      </ul>
      </>}
      </div>
      </div>
    </main>
  );
}
