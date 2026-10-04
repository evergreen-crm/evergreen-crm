// One house: its residents, upcoming calendar, and house details (editable).
import Link from 'next/link';
import UseMyLocation from './UseMyLocation';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { HOUSE_TYPES, fmtDate, fmtTime, todayISO, age, daysUntil } from '@/lib/options';
import { updateHome } from '@/app/homes/actions';
import EntryForm from '@/app/components/EntryForm';
import EntryList from '@/app/components/EntryList';

export default async function HomePage({ params, searchParams }) {
  const { id } = await params;
  const { edit, tab = 'residents' } = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const canEdit = ['admin', 'manager'].includes(profile.role);

  const today = todayISO();
  const [{ data: home }, { data: residents }, { data: appts }] = await Promise.all([
    supabase.from('homes').select('*').eq('id', id).maybeSingle(),
    supabase.from('residents')
      .select('id, first_name, last_name, preferred_name, date_of_birth, care_type, status, allergies, care_plan_review_date')
      .eq('home_id', id).order('last_name'),
    supabase.from('appointments')
      .select('id, title, category, appt_date, start_time, status, residents(first_name, last_name)')
      .eq('home_id', id).gte('appt_date', today).neq('status', 'Cancelled')
      .order('appt_date').order('start_time').limit(8),
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
  const TABS = [['residents', 'Residents'], ['commbook', 'Communication book'], ['safety', 'Fire drills & safety']];

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
            <label>Phone<input name="phone" defaultValue={home.phone ?? ''} /></label>
            <label>
              Who lives here
              <select name="house_type" defaultValue={home.house_type ?? 'Adults'}>
                {HOUSE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label>Capacity<input type="number" min="1" name="capacity" defaultValue={home.capacity ?? ''} /></label>
          </div>
          <label>Licence number<input name="licence_number" defaultValue={home.licence_number ?? ''} /></label>
          <fieldset className="card">
            <legend>House location (for staff check-ins)</legend>
            <div className="row">
              <label>Latitude<input name="lat" inputMode="decimal" defaultValue={home.lat ?? ''} placeholder="49.2827" /></label>
              <label>Longitude<input name="lng" inputMode="decimal" defaultValue={home.lng ?? ''} placeholder="-123.1207" /></label>
              <label>Counts as “at the house” within (metres)<input type="number" min="25" max="2000" name="geofence_m" defaultValue={home.geofence_m ?? 200} /></label>
            </div>
            <UseMyLocation />
            <p className="muted small">Stand at the house and tap the button, or in Google Maps right-click the house and copy the two numbers.</p>
          </fieldset>
          <label>Notes<textarea name="notes" rows={2} defaultValue={home.notes ?? ''} /></label>
          <div className="row">
            <button>Save</button>
            <Link className="button secondary" href={`/homes/${id}`}>Cancel</Link>
          </div>
        </form>
      )}

      {!drillThisMonth && <p className="alert">No fire drill recorded yet this month{lastDrill ? ` (last one ${fmtDate(lastDrill.entry_date)})` : ''}.</p>}
      <nav className="tabs-bar no-print">
        {TABS.map(([k, label]) => <Link key={k} href={`${path}?tab=${k}`} className={tab === k ? 'on' : ''}>{label}</Link>)}
        <Link href={`/schedule?home=${id}`}>Schedule →</Link>
      </nav>

      {tab === 'commbook' && (
        <section>
          <p className="muted small">Read this at the start of every shift. Important messages stay highlighted.</p>
          <EntryForm kind="commbook" homeId={id} path={path} title="Write in the communication book" open />
          <EntryList entries={houseEntries} path={path} isAdmin={isAdmin} empty="No messages yet." />
        </section>
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
    </main>
  );
}
