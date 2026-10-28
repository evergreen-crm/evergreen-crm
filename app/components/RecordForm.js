// A record as a form: required fields first, optional fields next, date and time at the end.
// Answer it, save it, or print it for the file. Uses the same save action as every other entry.
import { ENTRY_TYPES } from '@/lib/entries';
import { saveEntry } from '@/app/entries/actions';
import { Field } from '@/app/components/EntryForm';
import { todayISO, nowTime, fmtDate } from '@/lib/options';
import PrintButton from '@/app/components/PrintButton';

// Reports that are made right away: the date and time are shown and can be changed.
const REPORT_NOW = ['mcfd_incident', 'mcfd_restraint', 'mcfd_illness'];

export default function RecordForm({ kind, homeId, residentId, path, goals, title, standard, resident, home, compact = false, date }) {
  const type = ENTRY_TYPES[kind];
  const required = type.fields.filter((f) => f.required);
  const optional = type.fields.filter((f) => !f.required);
  return (
    <div className={compact ? undefined : 'print-area'}>
      {!compact && <header style={{ borderBottom: '2px solid #000', paddingBottom: 8, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>{title ?? type.label}</h1>
        <p className="small" style={{ margin: '4px 0 0' }}>
          <strong>Resident:</strong> {resident} · <strong>House:</strong> {home}{standard ? ` · Standard: ${standard}` : ''}
        </p>
        <p className="small muted" style={{ margin: '4px 0 0' }}>Fields marked * must be filled in. Other fields are optional. Date and time are at the bottom.</p>
      </header>}
      <form action={saveEntry}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="home_id" value={homeId} />
        <input type="hidden" name="resident_id" value={residentId} />
        <input type="hidden" name="path" value={path} />
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small"><strong>Required</strong></legend>
          <div className="row">{required.map((f) => <Field key={f.name} f={f} goals={goals} />)}</div>
        </fieldset>
        {optional.length > 0 && (
          <fieldset style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
            <legend className="small"><strong>Not required (fill in if it applies)</strong></legend>
            <div className="row">{optional.filter((f) => f.type !== 'textarea').map((f) => <Field key={f.name} f={f} goals={goals} />)}</div>
            {optional.filter((f) => f.type === 'textarea').map((f) => <Field key={f.name} f={f} goals={goals} />)}
          </fieldset>
        )}
        {compact && !REPORT_NOW.includes(kind) ? (
          <p className="small muted" style={{ marginTop: 10 }}>
            <input type="hidden" name="entry_date" value={date ?? todayISO()} />
            Recorded for {fmtDate(date ?? todayISO())}. The time is recorded when you press Save.
          </p>
        ) : (
          <fieldset style={{ border: 0, padding: 0, margin: '16px 0 0', borderTop: '1px solid #000', paddingTop: 12 }}>
            <legend className="small"><strong>Date and time</strong></legend>
            <div className="row">
              <label>Date<input type="date" name="entry_date" required defaultValue={todayISO()} /></label>
              <label>Time<input type="time" name="entry_time" defaultValue={nowTime()} /></label>
            </div>
          </fieldset>
        )}
        <div className="row no-print" style={{ marginTop: 16, gap: 8 }}>
          <button>Save record</button>
          <PrintButton />
        </div>
      </form>
      {!compact && <style>{`@media print { .no-print, nav, header.app-header { display: none !important; } .print-area { font-size: 12pt; } input, textarea, select { border: 1px solid #000 !important; } }`}</style>}
    </div>
  );
}
