// A list of saved entries, newest first.
import { ENTRY_TYPES } from '@/lib/entries';
import { fmtDate, fmtTime } from '@/lib/options';
import { deleteEntry } from '@/app/entries/actions';

export default function EntryList({ entries, ctx, path, isAdmin, showFamily, showResident, empty = 'Nothing recorded yet.' }) {
  if (!entries?.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="timeline">
      {entries.map((e) => {
        const t = ENTRY_TYPES[e.kind];
        const important = e.kind === 'commbook' && e.data?.priority === 'Important';
        const bad = (e.kind === 'safety_check' && e.data?.result === 'Fail — needs action') || e.kind === 'seizure';
        return (
          <li key={e.id} className={important || bad ? 'important' : ''}>
            <div className="meta">
              <span>{t?.icon} <strong>{t?.label ?? e.kind}</strong></span>
              <span>{fmtDate(e.entry_date)}{e.entry_time && ` · ${fmtTime(e.entry_time)}`}</span>
              <span>· {e.author?.full_name ?? 'Staff'}</span>
              {showResident && e.residents && <span>· {e.residents.first_name} {e.residents.last_name}</span>}
              {e.amount !== null && e.amount !== undefined && (
                <span className={`badge ${e.amount < 0 ? 'bad' : ''}`}>{e.amount < 0 ? '−' : '+'}${Math.abs(e.amount).toFixed(2)}</span>
              )}
              {showFamily && e.share_with_family && <span className="badge">Shared with family</span>}
            </div>
            <p>{t ? t.summary(e.data ?? {}, ctx) : JSON.stringify(e.data)}</p>
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
