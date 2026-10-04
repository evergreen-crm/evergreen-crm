// One area's records page: requirements, add a record, the register, print.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { findArea, isDone, STATUSES } from '@/lib/divisions';
import { getGrants, canSee, canEditRecord } from '@/lib/portal';
import { todayISO, fmtDate, TZ } from '@/lib/options';
import { saveRecord, setRecordStatus } from '@/app/portal/actions';
import RecordFields from '@/app/portal/RecordFields';
import Kpis from '@/app/portal/Kpis';
import PrintButton from '@/app/PrintButton';

export default async function AreaPage({ params, searchParams }) {
  const { division, area: areaKey } = await params;
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { div, area } = findArea(division, areaKey);
  if (!area) notFound();
  const grants = await getGrants(supabase, profile);
  if (!canSee(profile, grants, div)) notFound();
  const today = todayISO();
  const show = sp.show ?? 'all';
  const base = `/portal/${division}/${areaKey}`;

  let q = supabase.from('records')
    .select('*, homes(name), residents(first_name, last_name), author:created_by(full_name)')
    .eq('division', division).eq('area', areaKey);
  if (sp.home) q = q.eq('home_id', sp.home);
  if (sp.year) q = q.gte('record_date', `${sp.year}-01-01`).lte('record_date', `${sp.year}-12-31`);
  if (show === 'open') q = q.in('status', ['Open', 'In progress']);
  if (show === 'overdue') q = q.in('status', ['Open', 'In progress']).lt('due_date', today);
  const [{ data: records }, { data: homes }, { data: residents }] = await Promise.all([
    q.order('record_date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
    supabase.from('homes').select('id, name').order('name'),
    area.resident ? supabase.from('residents').select('id, first_name, last_name').neq('status', 'discharged').order('last_name') : { data: [] },
  ]);
  const homeName = homes?.find((h) => h.id === sp.home)?.name;
  const qs = (o) => base + '?' + new URLSearchParams({ ...(sp.home && { home: sp.home }), ...(sp.year && { year: sp.year }), show, ...o }).toString();

  return (
    <main style={{ '--div': div.color }}>
      <p className="small no-print"><Link href="/portal">Portal</Link> › <Link href={`/portal/${division}`}>{div.num}. {div.title}</Link></p>
      <div className="div-banner">
        <span className="div-icon">{div.icon}</span>
        <div>
          <h1>{area.title}</h1>
          <p>{div.num}. {div.title} · {area.std}</p>
        </div>
        <span className="no-print"><PrintButton label="Print" /></span>
      </div>
      <p className="print-only small muted">
        Printed {new Date().toLocaleString('en-CA', { timeZone: TZ })} by {profile.full_name}
        {homeName && ` · House: ${homeName}`}{sp.year && ` · Year ${sp.year}`}{show !== 'all' && ` · ${show} only`}
      </p>

      <details className="card" open={!records?.length}>
        <summary><strong>What this area requires</strong> <span className="muted small">— {area.summary}</span></summary>
        <ul className="rules">{area.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        {area.links?.length > 0 && (
          <p className="small no-print">{area.links.map((l, i) => <span key={l.href + i}>{i > 0 && ' · '}<Link href={l.href}>{l.label} →</Link></span>)}</p>
        )}
      </details>

      {area.kpi && <Kpis supabase={supabase} />}

      <details className="card no-print">
        <summary><strong>+ Add a record</strong></summary>
        <form action={saveRecord}>
          <input type="hidden" name="division" value={division} />
          <input type="hidden" name="area" value={areaKey} />
          <RecordFields area={area} homes={homes} residents={residents} defaultHome={profile.role === 'staff' ? profile.home_id : ''} />
          <button>Save record</button>
        </form>
      </details>

      <form className="row no-print filters" action={base}>
        <label>Show
          <select name="show" defaultValue={show}>
            <option value="all">All records</option>
            <option value="open">Open only</option>
            <option value="overdue">Overdue only</option>
          </select>
        </label>
        <label>House
          <select name="home" defaultValue={sp.home ?? ''}>
            <option value="">All houses</option>
            {homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <label>Year<input name="year" type="number" min="2020" max="2100" defaultValue={sp.year ?? ''} placeholder="All" /></label>
        <button className="secondary">Filter</button>
      </form>

      <h2>Records ({records?.length ?? 0})</h2>
      {records?.length === 0 && <p className="muted">No records yet.</p>}
      {records?.length > 0 && (
        <table className="register">
          <thead><tr><th>Date</th><th>Record</th><th>House / resident</th><th>Due</th><th>Status</th><th>By</th></tr></thead>
          <tbody>
            {records.map((r) => {
              const overdue = !isDone(r) && r.due_date && r.due_date < today;
              const canEdit = canEditRecord(profile, grants, r, user.id);
              return (
                <tr key={r.id} className={overdue ? 'late' : isDone(r) ? 'done-row' : ''}>
                  <td>{fmtDate(r.record_date)}</td>
                  <td>
                    <Link href={`/portal/record/${r.id}`}><strong>{r.title}</strong></Link>
                    {r.record_type && <div className="muted small">{r.record_type}</div>}
                  </td>
                  <td className="small">{r.homes?.name ?? 'All'}{r.residents && <div>{r.residents.first_name} {r.residents.last_name}</div>}</td>
                  <td>{r.due_date ? fmtDate(r.due_date) : '—'}{overdue && <div><span className="badge bad">Overdue</span></div>}</td>
                  <td>
                    {canEdit ? (
                      <form action={setRecordStatus} className="mar-form">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="path" value={base} />
                        <select name="status" defaultValue={r.status}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                        <button className="secondary no-print">Set</button>
                      </form>
                    ) : r.status}
                  </td>
                  <td className="small">{r.author?.full_name ?? '—'}
                    {canEdit && <div className="no-print"><Link href={`/portal/record/${r.id}?edit=1`}>Edit</Link></div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="small no-print"><Link href={qs({ show: 'overdue' })}>Show overdue</Link> · <Link href={qs({ show: 'all' })}>Show all</Link></p>
    </main>
  );
}
