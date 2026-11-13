// One form: choose the person (or house), fill it in, save. Opened from a reminder task, it carries ?task=
// so saving completes the task. Past forms of this kind for the same person/house are listed below to print.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ENTRY_TYPES } from '@/lib/entries';
import { Field } from '@/app/components/EntryForm';
import { fmtDate, todayISO, nowTime } from '@/lib/options';
import { plainError } from '@/lib/plain';
import PrintButton from '@/app/PrintButton';
import { saveFormEntry } from '../actions';

export const dynamic = 'force-dynamic';

function Q({ f }) {
  if (f.type === 'yesno') {
    return <label>{f.label}<select name={f.name} required={f.required} defaultValue=""><option value="">{f.required ? 'Choose…' : '—'}</option><option>Yes</option><option>No</option></select></label>;
  }
  return <Field f={f} />;
}

export default async function FormPage({ params, searchParams }) {
  const { kind } = await params;
  const sp = (await searchParams) ?? {};
  const type = ENTRY_TYPES[kind];
  if (!type) notFound();
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isPerson = type.scope === 'resident';
  const isStaff = type.scope === 'staff';
  const [{ data: people }, { data: homes }, { data: staffList }] = await Promise.all([
    isPerson ? supabase.from('residents').select('id, first_name, preferred_name, last_name, home_id').is('discharge_date', null).order('first_name') : Promise.resolve({ data: [] }),
    supabase.from('homes').select('id, name').order('name'),
    isStaff ? supabase.from('profiles').select('id, full_name, home_id').eq('active', true).neq('role', 'family').order('full_name') : Promise.resolve({ data: [] }),
  ]);
  const person = isPerson ? (people ?? []).find((r) => r.id === sp.resident) : null;
  const worker = isStaff ? (staffList ?? []).find((p) => p.id === sp.staff) : null;
  const homeId = isPerson ? person?.home_id : isStaff ? (worker?.home_id || profile.home_id || homes?.[0]?.id) : (sp.home || profile.home_id || homes?.[0]?.id);
  const home = (homes ?? []).find((h) => h.id === homeId);
  const ready = isPerson ? !!person : isStaff ? !!worker : !!home;
  const { data: past } = ready
    ? await (isPerson
      ? supabase.from('entries').select('id, entry_date, entry_time, data, author:created_by(full_name)').eq('kind', kind).eq('resident_id', person.id)
      : isStaff
      ? supabase.from('entries').select('id, entry_date, entry_time, data, author:created_by(full_name)').eq('kind', kind).eq('subject_profile_id', worker.id)
      : supabase.from('entries').select('id, entry_date, entry_time, data, author:created_by(full_name)').eq('kind', kind).eq('home_id', homeId).is('resident_id', null))
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(30)
    : { data: [] };
  const who = person ? `${person.preferred_name || person.first_name} ${person.last_name ?? ''}` : worker ? worker.full_name : home?.name;
  const short = type.fields.filter((f) => f.type !== 'textarea');
  const long = type.fields.filter((f) => f.type === 'textarea');

  return (
    <main className="report">
      <p className="small no-print"><Link href="/forms">← All forms</Link>{person && <> · <Link href={`/residents/${person.id}`}>{who}’s page</Link></>}</p>
      <div className="title-row"><h1>{type.icon} {type.label}</h1><span className="no-print"><PrintButton /></span></div>
      {type.source && <p className="small muted">Evergreen policy: {type.source}{type.signs ? ` · ${type.signs}` : ''}</p>}
      {type.intro && <p className="message small">{type.intro}</p>}
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message error">{plainError(sp.error)}</p>}
      {sp.task && <p className="message small">This form was opened from a reminder task. Saving it marks the task done and sends it for approval.</p>}

      <form method="get" className="row no-print">
        {sp.task && <input type="hidden" name="task" value={sp.task} />}
        {isStaff
          ? <label>Staff member<select name="staff" defaultValue={worker?.id ?? ''} required><option value="">Choose the staff member…</option>{(staffList ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
          : isPerson
          ? <label>Person<select name="resident" defaultValue={person?.id ?? ''} required><option value="">Choose the person…</option>{(people ?? []).map((r) => <option key={r.id} value={r.id}>{r.preferred_name || r.first_name} {r.last_name ?? ''}</option>)}</select></label>
          : <label>House<select name="home" defaultValue={homeId ?? ''} required>{(homes ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>}
        <button className="secondary">{ready ? 'Change' : 'Open the form'}</button>
      </form>

      {ready && (
        <form action={saveFormEntry} className="card no-print">
          <h2 style={{ marginTop: 0 }}>New form · {who}</h2>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="home_id" value={homeId ?? ''} />
          {person && <input type="hidden" name="resident_id" value={person.id} />}
          {worker && <input type="hidden" name="subject_profile_id" value={worker.id} />}
          {sp.task && <input type="hidden" name="task" value={sp.task} />}
          <div className="row">
            <label>Date<input type="date" name="entry_date" required defaultValue={todayISO()} /></label>
            <label>Time<input type="time" name="entry_time" defaultValue={nowTime()} /></label>
            {short.map((f) => <Q key={f.name} f={f} />)}
          </div>
          {long.map((f) => <Q key={f.name} f={f} />)}
          <p className="small muted">Saving signs this form with your name, date and time. A saved form can be corrected later; the original is kept.</p>
          <button>Save and sign</button>
        </form>
      )}

      {ready && (
        <>
          <h2>Completed forms · {who}</h2>
          {(past ?? []).length === 0 ? <p className="muted small">None yet.</p> : (past ?? []).map((e) => (
            <section key={e.id} id={`e-${e.id}`} className="card small">
              <strong>{fmtDate(e.entry_date)}{e.entry_time ? ` ${String(e.entry_time).slice(0, 5)}` : ''}</strong> · signed by {e.author?.full_name ?? '—'}
              <p style={{ margin: '4px 0' }}>{type.summary ? type.summary(e.data ?? {}) : ''}</p>
              <details><summary className="link">All answers</summary>
                <dl>{type.fields.filter((f) => e.data?.[f.name] != null && e.data[f.name] !== '').map((f) => <div key={f.name}><dt className="muted">{f.label}</dt><dd style={{ whiteSpace: 'pre-wrap', margin: '0 0 6px' }}>{String(e.data[f.name])}</dd></div>)}</dl>
              </details>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
