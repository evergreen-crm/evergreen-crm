// The add / edit form for one QA record type. Used on /qa/records/[type] and the quarterly report.
import Link from 'next/link';
import { todayISO } from '@/lib/options';
import { personLabel } from '@/lib/levels';
import { QA_RECORD_STATUSES } from '@/lib/qa';
import { saveQaRecord } from './actions';

function Field({ f, value }) {
  const name = 'f_' + f.name;
  const v = value ?? '';
  const req = f.required;
  const label = <>{f.label}{req && <span className="bad-text"> *</span>}</>;
  switch (f.type) {
    case 'textarea': return <label>{label}<textarea name={name} rows={3} required={req} maxLength={4000} defaultValue={v} /></label>;
    case 'number': return <label>{label}<input type="number" name={name} min="0" step={f.step ?? '1'} required={req} defaultValue={v} /></label>;
    case 'date': return <label>{label}<input type="date" name={name} required={req} defaultValue={v} /></label>;
    case 'yesno': return <label>{label}<select name={name} defaultValue={v}><option value="">—</option><option>Yes</option><option>No</option></select></label>;
    case 'select': return (
      <label>{label}
        <select name={name} required={req} defaultValue={v}>
          <option value="">{req ? 'Choose…' : '—'}</option>
          {f.options.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
    );
    default: return <label>{label}<input name={name} required={req} maxLength={300} defaultValue={v} /></label>;
  }
}

export default function QaRecordForm({ type, record, homes = [], residents = [], people = [], userId, back, fixedTitle, fixedType, submitLabel, cancelHref, showAction = true }) {
  const r = record ?? {};
  const short = type.fields.filter((f) => f.type !== 'textarea');
  const long = type.fields.filter((f) => f.type === 'textarea');
  return (
    <form action={saveQaRecord} className="qa-record-form">
      <input type="hidden" name="type" value={type.key} />
      {r.id && <input type="hidden" name="id" value={r.id} />}
      {back && <input type="hidden" name="back" value={back} />}
      {fixedTitle ? <input type="hidden" name="title" value={fixedTitle} /> : null}
      {fixedType ? <input type="hidden" name="record_type" value={fixedType} /> : null}
      {!fixedTitle && (
        <div className="row">
          {type.types?.length > 0 && !fixedType && (
            <label>Type<span className="bad-text"> *</span>
              <select name="record_type" required defaultValue={r.record_type ?? ''}>
                <option value="" disabled>Choose…</option>
                {type.types.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          )}
          <label>Title<span className="bad-text"> *</span><input name="title" required maxLength={300} defaultValue={r.title ?? ''} placeholder={type.titleHint ?? ''} /></label>
        </div>
      )}
      <div className="row">
        <label>Date<input type="date" name="record_date" required defaultValue={r.record_date ?? todayISO()} /></label>
        {!fixedTitle && (
          <label>{type.dueLabel ?? 'Due / follow-up date'}<input type="date" name="due_date" defaultValue={r.due_date ?? ''} />
            {!r.id && type.dueDays && <span className="muted small">Blank = {type.dueDays} days after the date</span>}
          </label>
        )}
        <label>Status<select name="status" defaultValue={r.status ?? 'Open'}>{QA_RECORD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
        {!fixedTitle && (
          <label>House
            <select name="home_id" defaultValue={r.home_id ?? ''}>
              <option value="">All / organization</option>
              {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
        )}
        {type.resident && (
          <label>Resident (optional)
            <select name="resident_id" defaultValue={r.resident_id ?? ''}>
              <option value="">—</option>
              {residents.map((x) => <option key={x.id} value={x.id}>{x.preferred_name || x.first_name} {x.last_name ? `${x.last_name[0]}.` : ''}</option>)}
            </select>
          </label>
        )}
      </div>
      {short.length > 0 && <div className="row">{short.map((f) => <Field key={f.name} f={f} value={r.data?.[f.name]} />)}</div>}
      {long.map((f) => <Field key={f.name} f={f} value={r.data?.[f.name]} />)}
      {showAction && (
        <fieldset className="qa-make-action">
          <label className="inline"><input type="checkbox" name="make_action" /> Also open an improvement action for the follow-up</label>
          {people.length > 0 && (
            <label>Action owner
              <select name="action_owner" defaultValue={userId ?? ''}>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({personLabel(p)})</option>)}</select>
            </label>
          )}
        </fieldset>
      )}
      <div className="row">
        <button>{submitLabel ?? (r.id ? 'Save changes' : 'Save record')}</button>
        {cancelHref && <Link className="button secondary" href={cancelHref}>Cancel</Link>}
      </div>
    </form>
  );
}
