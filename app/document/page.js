// 📝 Document records: the easy way in. Choose a house, choose a child, then write each record in its section.
// Each section follows the documentation guide (MCFD standards or CLBC). Every entry is saved with the date and time you set.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { todayISO, fmtDate } from '@/lib/options';
import { recordsFor, isDaily } from '@/lib/records';
import RecordForm from '@/app/components/RecordForm';

const isId = (s) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const nameOf = (r) => `${r.preferred_name || r.first_name} ${r.last_name}`;

export default async function DocumentRecords({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);

  const { data: homes } = await supabase.from('homes').select('id, name, program').order('name');
  const houseId = isId(sp.house) ? sp.house : (homes ?? []).find((h) => h.id === profile.home_id)?.id ?? null;
  const house = (homes ?? []).find((h) => h.id === houseId) ?? null;

  const { data: residents } = house
    ? await supabase.from('residents').select('id, first_name, preferred_name, last_name, status').eq('home_id', house.id).neq('status', 'discharged').order('first_name')
    : { data: [] };
  const resident = isId(sp.resident) ? (residents ?? []).find((r) => r.id === sp.resident) ?? null : null;
  const records = recordsFor(house?.program);

  const { data: todays } = resident && records.length
    ? await supabase.from('entries').select('kind').eq('resident_id', resident.id).eq('entry_date', todayISO())
    : { data: [] };
  const doneToday = new Set((todays ?? []).map((e) => e.kind));

  return (
    <main>
      <div className="title-row"><h1>📝 Document records</h1></div>
      <p className="muted small">Choose the house, then the child, then write each record in its section. Set the date and time on each form if it is for another time. Save, and it is kept with the date and time.</p>

      <nav className="tabs-bar" aria-label="Houses">
        {(homes ?? []).map((h) => (
          <Link key={h.id} href={`/document?house=${h.id}`} className={h.id === house?.id ? 'on' : ''}>{h.name}{h.program ? ` (${h.program})` : ''}</Link>
        ))}
      </nav>

      {!house && <p className="card">Choose a house above.</p>}
      {house && !house.program && <p className="message error">{house.name} has no program yet. Use Edit house on the house page and choose MCFD or CLBC.</p>}

      {house && house.program && !resident && (
        <section>
          <h2>{house.name}: choose a child or adult</h2>
          {(residents ?? []).length === 0 && <p className="muted">No current residents in this house.</p>}
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {(residents ?? []).map((r) => (
              <Link key={r.id} className="button" href={`/document?house=${house.id}&resident=${r.id}`}>{nameOf(r)}</Link>
            ))}
          </div>
        </section>
      )}

      {house && house.program && resident && (
        <section>
          <p className="small"><Link href={`/document?house=${house.id}`}>← Choose someone else</Link> · <Link href={`/homes/${house.id}?tab=records`}>All records for {house.name}</Link></p>
          <h2 style={{ marginBottom: 4 }}>{nameOf(resident)} · {house.program} records</h2>
          <p className="muted small">Today ({fmtDate(todayISO())}): {records.filter(isDaily).every((r) => doneToday.has(r.kind)) ? 'daily records done' : 'daily records still to do'}.</p>
          {records.map((rec) => (
            <details key={rec.kind} className="card" open={isDaily(rec) || !doneToday.has(rec.kind) && rec.kind !== 'mar'} style={{ marginTop: 10 }}>
              <summary>
                <strong>{rec.section}</strong>{' '}
                <span className="muted small">· {rec.standard}</span>{' '}
                {rec.tab
                  ? <Link className="small" href={`/residents/${resident.id}?tab=${rec.tab}`}>Open the medication record →</Link>
                  : <span className={doneToday.has(rec.kind) ? 'badge' : 'badge warn'}>{doneToday.has(rec.kind) ? 'entered today' : 'not yet today'}</span>}
              </summary>
              <p className="small muted" style={{ margin: '6px 0' }}>{rec.when}</p>
              {!rec.tab && (
                <RecordForm compact kind={rec.kind} homeId={house.id} residentId={resident.id}
                  path={`/document?house=${house.id}&resident=${resident.id}`} goals={[]} />
              )}
            </details>
          ))}
        </section>
      )}
    </main>
  );
}
