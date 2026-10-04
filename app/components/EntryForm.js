// A form built from the entry type's field list in lib/entries.js.
import { ENTRY_TYPES } from '@/lib/entries';
import { todayISO, nowTime } from '@/lib/options';
import { saveEntry } from '@/app/entries/actions';

function Field({ f, goals }) {
  const req = f.required;
  switch (f.type) {
    case 'textarea':
      return <label>{f.label}<textarea name={f.name} rows={3} required={req} /></label>;
    case 'number':
      return <label>{f.label}<input type="number" name={f.name} step={f.step ?? '1'} required={req} /></label>;
    case 'time':
      return <label>{f.label}<input type="time" name={f.name} required={req} /></label>;
    case 'select':
      return (
        <label>{f.label}
          <select name={f.name} required={req} defaultValue="">
            <option value="">{req ? 'Choose…' : '—'}</option>
            {f.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
      );
    case 'yesno':
      return (
        <label>{f.label}
          <select name={f.name} defaultValue=""><option value="">—</option><option>Yes</option><option>No</option></select>
        </label>
      );
    case 'goal':
      return (
        <label>{f.label}
          <select name={f.name} required={req} defaultValue="">
            <option value="">Choose a goal…</option>
            {(goals ?? []).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
      );
    default:
      return <label>{f.label}<input name={f.name} required={req} /></label>;
  }
}

export default function EntryForm({ kind, homeId, residentId, path, goals, shareable, title, open = false }) {
  const type = ENTRY_TYPES[kind];
  const short = type.fields.filter((f) => f.type !== 'textarea');
  const long = type.fields.filter((f) => f.type === 'textarea');
  return (
    <details className="card no-print" open={open}>
      <summary><strong>+ {title ?? `New ${type.label.toLowerCase()} entry`}</strong></summary>
      <form action={saveEntry}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="home_id" value={homeId} />
        {residentId && <input type="hidden" name="resident_id" value={residentId} />}
        <input type="hidden" name="path" value={path} />
        <div className="row">
          <label>Date<input type="date" name="entry_date" required defaultValue={todayISO()} /></label>
          <label>Time<input type="time" name="entry_time" defaultValue={nowTime()} /></label>
          {short.map((f) => <Field key={f.name} f={f} goals={goals} />)}
        </div>
        {long.map((f) => <Field key={f.name} f={f} goals={goals} />)}
        {shareable && <label className="check"><input type="checkbox" name="share_with_family" /> Share with family</label>}
        <button>Save</button>
      </form>
    </details>
  );
}
