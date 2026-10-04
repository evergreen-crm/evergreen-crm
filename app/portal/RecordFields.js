// The form fields for a portal record (used for both "add" and "edit").
import { STATUSES } from '@/lib/divisions';
import { todayISO } from '@/lib/options';

function Field({ f, value }) {
  const name = 'f_' + f.name;
  const v = value ?? '';
  const req = f.required;
  switch (f.type) {
    case 'textarea': return <label>{f.label}<textarea name={name} rows={3} required={req} defaultValue={v} /></label>;
    case 'number': return <label>{f.label}<input type="number" name={name} step={f.step ?? '1'} required={req} defaultValue={v} /></label>;
    case 'date': return <label>{f.label}<input type="date" name={name} required={req} defaultValue={v} /></label>;
    case 'time': return <label>{f.label}<input type="time" name={name} required={req} defaultValue={v} /></label>;
    case 'yesno': return (
      <label>{f.label}<select name={name} defaultValue={v}><option value="">—</option><option>Yes</option><option>No</option></select></label>
    );
    case 'select': return (
      <label>{f.label}
        <select name={name} required={req} defaultValue={v}>
          <option value="">{req ? 'Choose…' : '—'}</option>
          {f.options.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
    );
    default: return <label>{f.label}<input name={name} required={req} defaultValue={v} /></label>;
  }
}

export default function RecordFields({ area, record, homes, residents, defaultHome }) {
  const r = record ?? {};
  const short = area.fields.filter((f) => f.type !== 'textarea');
  const long = area.fields.filter((f) => f.type === 'textarea');
  return (
    <>
      <div className="row">
        {area.types?.length > 0 && (
          <label>Type
            <select name="record_type" required defaultValue={r.record_type ?? ''}>
              <option value="" disabled>Choose…</option>
              {area.types.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        )}
        <label>Title / subject<input name="title" required defaultValue={r.title ?? ''} /></label>
      </div>
      <div className="row">
        <label>Date<input type="date" name="record_date" required defaultValue={r.record_date ?? todayISO()} /></label>
        <label>Due date<input type="date" name="due_date" defaultValue={r.due_date ?? ''} />
          {!record && area.dueDays && <span className="muted small">Blank = {area.dueDays} days after the date</span>}
        </label>
        <label>Status<select name="status" defaultValue={r.status ?? 'Open'}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
      </div>
      <div className="row">
        <label>House
          <select name="home_id" defaultValue={r.home_id ?? defaultHome ?? ''}>
            <option value="">All / organization</option>
            {homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        {area.resident && (
          <label>Resident (optional)
            <select name="resident_id" defaultValue={r.resident_id ?? ''}>
              <option value="">—</option>
              {residents?.map((x) => <option key={x.id} value={x.id}>{x.first_name} {x.last_name}</option>)}
            </select>
          </label>
        )}
      </div>
      {short.length > 0 && <div className="row">{short.map((f) => <Field key={f.name} f={f} value={r.data?.[f.name]} />)}</div>}
      {long.map((f) => <Field key={f.name} f={f} value={r.data?.[f.name]} />)}
    </>
  );
}
