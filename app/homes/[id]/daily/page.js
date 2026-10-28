// Daily grid: one row per child, the day book and daily checks entered together for one date.
// Pick the date at the top, fill the row, then press Save all. Records already saved for that date show as saved.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { todayISO, addDaysISO, fmtDate } from '@/lib/options';
import { ENTRY_TYPES } from '@/lib/entries';
import { dailyKindsFor, gridFields } from '@/lib/dailyGrid';
import { saveDailyGrid } from '@/app/homes/daily-actions';

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function Cell({ resident, kind, field }) {
  const name = `g|${resident.id}|${kind}|${field.name}`;
  const label = `${resident.preferred_name || resident.first_name}: ${field.label}`;
  if (field.type === 'select') {
    return <select name={name} aria-label={label}><option value="">—</option>{field.options.map((o) => <option key={o}>{o}</option>)}</select>;
  }
  if (field.type === 'yesno') {
    return <select name={name} aria-label={label}><option value="">—</option><option>Yes</option><option>No</option></select>;
  }
  if (field.type === 'textarea') {
    return <input name={name} aria-label={label} placeholder="Notes" style={{ minWidth: 180 }} />;
  }
  return <input name={name} aria-label={label} style={{ minWidth: 120 }} />;
}

export default async function DailyGrid({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const { data: home } = await supabase.from('homes').select('id, name, program').eq('id', id).maybeSingle();
  if (!home) notFound();
  const kinds = dailyKindsFor(home.program);
  const date = isDate(sp.date) ? sp.date : todayISO();
  const { data: residents } = await supabase.from('residents')
    .select('id, first_name, preferred_name, last_name, status').eq('home_id', id).neq('status', 'discharged').order('first_name');
  const { data: saved } = kinds.length
    ? await supabase.from('entries').select('id, resident_id, kind, entry_time, data, created_by').eq('home_id', id).eq('entry_date', date).in('kind', kinds)
    : { data: [] };
  const savedBy = {};
  for (const e of saved ?? []) savedBy[`${e.resident_id}|${e.kind}`] = e;

  const base = `/homes/${id}/daily`;
  const nav = (d) => `${base}?date=${d}`;
  const saveDisabledNote = date > todayISO();

  return (
    <section>
      <div className="title-row">
        <h2>{home.name}: daily grid {home.program ? `(${home.program})` : ''}</h2>
      </div>
      {!kinds.length && <p className="message error">This house has no program yet. Choose MCFD or CLBC in Edit house.</p>}
      {sp.saved !== undefined && <p className="message">Saved {sp.saved} record{sp.saved === '1' ? '' : 's'} for {fmtDate(date)}.{sp.skipped ? ` Not saved: ${sp.skipped}.` : ''}</p>}

      <div className="row" style={{ alignItems: 'center', gap: 8 }}>
        <Link className="button secondary" href={nav(addDaysISO(date, -1))}>← Previous day</Link>
        <form method="get" action={base} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" name="date" defaultValue={date} max={todayISO()} aria-label="Date" />
          <button className="secondary">Go</button>
        </form>
        {date < todayISO() && <Link className="button secondary" href={nav(addDaysISO(date, 1))}>Next day →</Link>}
        <span className="small muted">{fmtDate(date)}</span>
      </div>
      <p className="muted small">Fill in only what happened. Each row is one child. Leave a cell blank if it is not needed. Save all writes every filled row at once. Records already saved for this date show as saved.</p>

      {kinds.length > 0 && (
        <form action={saveDailyGrid} style={{ marginTop: 8 }}>
          <input type="hidden" name="home_id" value={home.id} />
          <input type="hidden" name="entry_date" value={date} />
          <input type="hidden" name="program" value={home.program} />
          <div style={{ overflowX: 'auto' }}>
            <table className="small" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', position: 'sticky', left: 0, background: 'var(--card, #fff)' }}>Child / adult</th>
                  {kinds.map((k) => <th key={k} colSpan={gridFields(k).length} style={{ textAlign: 'left', borderLeft: '2px solid #888' }}>{ENTRY_TYPES[k].label}</th>)}
                </tr>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--card, #fff)' }}></th>
                  {kinds.map((k) => gridFields(k).map((f) => <th key={k + f.name} style={{ textAlign: 'left', fontWeight: 600, verticalAlign: 'bottom', maxWidth: 160, borderLeft: f === gridFields(k)[0] ? '2px solid #888' : undefined }}>{f.label}</th>))}
                </tr>
              </thead>
              <tbody>
                {(residents ?? []).length === 0 && <tr><td colSpan={99} className="muted">No current residents in this house.</td></tr>}
                {(residents ?? []).map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid #ddd' }}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--card, #fff)', whiteSpace: 'nowrap', paddingRight: 12 }}>
                      <strong>{r.preferred_name || r.first_name} {r.last_name}</strong>
                    </td>
                    {kinds.map((k) => {
                      const s = savedBy[`${r.id}|${k}`];
                      if (s) {
                        return <td key={k} colSpan={gridFields(k).length} className="small" style={{ borderLeft: '2px solid #888' }}>
                          <span className="badge">Saved {s.entry_time ? s.entry_time.slice(0, 5) : ''}</span>{' '}
                          <Link href={`/residents/${r.id}?tab=logs&type=${k}`}>View</Link>
                        </td>;
                      }
                      return gridFields(k).map((f, i) => (
                        <td key={k + f.name} style={{ borderLeft: i === 0 ? '2px solid #888' : undefined, padding: 2 }}>
                          <Cell resident={r} kind={k} field={f} />
                        </td>
                      ));
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(residents ?? []).length > 0 && (
            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <button disabled={saveDisabledNote}>Save all for {fmtDate(date)}</button>
              {saveDisabledNote && <span className="small muted">Dates after today can’t be saved.</span>}
            </div>
          )}
        </form>
      )}
    </section>
  );
}
