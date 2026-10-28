// A list of saved entries, newest first. Shows the date and time saved, the version, and its history.
import { ENTRY_TYPES } from '@/lib/entries';
import { fmtDate, fmtTime, TZ } from '@/lib/options';
import { deleteEntry, updateEntry } from '@/app/entries/actions';

const stamp = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '');

function Correct({ e, t, path }) {
  return (
    <details className="no-print">
      <summary className="link small">Correct this entry</summary>
      <form action={updateEntry} className="stack">
        <input type="hidden" name="id" value={e.id} /><input type="hidden" name="kind" value={e.kind} /><input type="hidden" name="path" value={path} />
        <div className="row">
          <label>Date<input type="date" name="entry_date" defaultValue={e.entry_date} required /></label>
          <label>Time<input type="time" name="entry_time" defaultValue={e.entry_time?.slice(0, 5) ?? ''} /></label>
        </div>
        {t.fields.map((f) => {
          const v = e.data?.[f.name] ?? '';
          if (f.type === 'textarea') return <label key={f.name}>{f.label}<textarea name={f.name} rows={3} defaultValue={v} required={f.required} /></label>;
          if (f.type === 'select') return (
            <label key={f.name}>{f.label}
              <select name={f.name} defaultValue={v} required={f.required}>
                <option value="">—</option>
                {f.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
          );
          if (f.type === 'yesno') return (
            <label key={f.name}>{f.label}
              <select name={f.name} defaultValue={v}><option value="">—</option><option>Yes</option><option>No</option></select>
            </label>
          );
          return <label key={f.name}>{f.label}<input name={f.name} type={f.type === 'number' ? 'number' : 'text'} step={f.step ?? '1'} defaultValue={v} /></label>;
        })}
        <label>Why are you correcting it? (kept in the history)<input name="reason" required placeholder="e.g., wrong time, missed a detail" /></label>
        <button>Save correction</button>
      </form>
    </details>
  );
}

export default function EntryList({ entries, versions = {}, ctx, path, isAdmin, canCorrect = () => false, showFamily, showResident, empty = 'Nothing recorded yet.' }) {
  if (!entries?.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="timeline">
      {entries.map((e) => {
        const t = ENTRY_TYPES[e.kind];
        const important = e.kind === 'commbook' && e.data?.priority === 'Important';
        const bad = (e.kind === 'safety_check' && e.data?.result === 'Fail — needs action') || e.kind === 'seizure' || e.kind === 'mcfd_restraint';
        const history = versions[e.id] ?? [];
        return (
          <li key={e.id} className={important || bad ? 'important' : ''}>
            <div className="meta">
              <span>{t?.icon} <strong>{t?.label ?? e.kind}</strong></span>
              <span>{fmtDate(e.entry_date)}{e.entry_time && ` · ${fmtTime(e.entry_time)}`}</span>
              <span>· {e.author?.full_name ?? 'Staff'}</span>
              <span className="muted small">saved {stamp(e.created_at)}</span>
              {e.version > 1 && <span className="badge">v{e.version} · changed {stamp(e.updated_at)} by {e.updater?.full_name ?? 'staff'}</span>}
              {showResident && e.residents && <span>· {e.residents.first_name} {e.residents.last_name}</span>}
              {e.amount !== null && e.amount !== undefined && (
                <span className={`badge ${e.amount < 0 ? 'bad' : ''}`}>{e.amount < 0 ? '−' : '+'}${Math.abs(e.amount).toFixed(2)}</span>
              )}
              {showFamily && e.share_with_family && <span className="badge">Shared with family</span>}
            </div>
            <p>{t ? t.summary(e.data ?? {}, ctx) : JSON.stringify(e.data)}</p>
            {history.length > 0 && (
              <details className="small">
                <summary className="link">Version history ({history.length} earlier)</summary>
                <ol className="small">
                  {history.map((h) => (
                    <li key={h.id}>v{h.version} · saved {stamp(h.saved_at)} by {h.saver?.full_name ?? 'staff'}{h.reason ? ` · correction reason for the next version: “${h.reason}”` : ''}
                      <div className="muted">{t ? t.summary(h.data ?? {}, ctx) : JSON.stringify(h.data)}</div>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {t && canCorrect(e) && <Correct e={e} t={t} path={path} />}
            {isAdmin && (
              <form action={deleteEntry} className="no-print">
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="path" value={path} />
                <button className="link small">Remove (admin)</button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
