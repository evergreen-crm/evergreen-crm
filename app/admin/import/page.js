// 📥 Staff import (plan E3): download the Excel template, fill in one row per person, upload, check, import.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { fmtDateTime } from '@/lib/options';
import { MAX_ROWS } from '@/lib/staffImport';
import { uploadImport, runImport, cancelImport } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const metadata = { title: 'Staff import · Evergreen' };

export default async function StaffImport({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase } = await requireUser(['admin']);
  const [{ data: batch }, { data: past }] = await Promise.all([
    sp.batch ? supabase.from('staff_import_batches').select('*, by:created_by(full_name)').eq('id', sp.batch).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('staff_import_batches').select('id, file_name, status, created_at, imported_at, results, rows').neq('status', 'Preview').order('created_at', { ascending: false }).limit(10),
  ]);
  const rows = batch?.rows ?? [];
  const ready = rows.filter((r) => r.ok);
  const bad = rows.filter((r) => !r.ok);
  const withOffer = ready.filter((r) => r.person.position && r.person.employment_type && r.person.hire_date);

  return (
    <main>
      <p><Link href="/admin">← Admin</Link></p>
      <h1>📥 Staff import</h1>
      <p className="muted">Add many staff at once from one Excel file. Each person is added exactly as on “Give a person access”: they get a staff number, sign in with a code sent to their email, and (if you choose) their offer letter.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}

      {!batch && (
        <>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>1. Download the template</h2>
            <p>An Excel file with the columns, drop-down lists (access level, house, position, full/part-time, program, certificate) and a “How to fill in” sheet. Houses and positions come from the portal, so add houses and pay rates first.</p>
            <p><a className="button" href="/admin/import/template">⬇ Download the Excel template</a></p>
          </section>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>2. Upload the filled-in file</h2>
            <p className="small">Up to {MAX_ROWS} people per file (.xlsx, or CSV with the same columns). Nothing is added yet: you see a preview first.</p>
            <form action={uploadImport}>
              <input type="file" name="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required />
              <p><button>Upload and check</button></p>
            </form>
          </section>
        </>
      )}

      {batch && batch.status === 'Preview' && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>3. Check the preview — {batch.file_name}</h2>
          <div className="stats">
            <div className="stat"><strong>{ready.length}</strong><span>ready to add</span></div>
            <div className={`stat ${bad.length ? 'warn' : ''}`}><strong>{bad.length}</strong><span>with problems (skipped)</span></div>
            <div className="stat"><strong>{withOffer.length}</strong><span>with job details for an offer letter</span></div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Row</th><th>Person</th><th>Access / house</th><th>Job</th><th>Certificates</th><th>Check</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.row} style={r.ok ? undefined : { background: '#fdecea' }}>
                  <td>{r.row}</td>
                  <td><strong>{r.person.full_name || '—'}</strong><div className="small muted">{r.person.email}{r.person.phone ? ` · ${r.person.phone}` : ''}</div></td>
                  <td className="small">{r.person.access?.label ?? '—'}{r.person.house ? <div>{r.person.house}</div> : null}</td>
                  <td className="small">{[r.person.position, r.person.employment_type, r.person.hours_per_week && `${r.person.hours_per_week} h/week`, r.person.program, r.person.hire_date && `starts ${r.person.hire_date}`].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="small">{r.person.certs.map((c) => `${c.name}${c.expires ? ` (exp. ${c.expires})` : ''}`).join(', ') || '—'}</td>
                  <td className="small">{r.errors.map((e) => <div key={e}>❌ {e}</div>)}{r.warnings.map((w) => <div key={w}>⚠ {w}</div>)}{r.ok && !r.warnings.length && '✅'}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
          {bad.length > 0 && <p className="small">Rows with ❌ are skipped. Fix them in the file and upload again, or import the others now and add the rest later.</p>}
          {ready.length > 0 ? (
            <form action={runImport}>
              <input type="hidden" name="batch" value={batch.id} />
              <fieldset style={{ border: 0, padding: 0 }}>
                <legend><strong>Offer letters</strong> (for the {withOffer.length} with position, full/part-time and start date)</legend>
                <label className="check"><input type="radio" name="send_offers" value="yes" defaultChecked={false} /> Send offer letters now (new hires)</label>
                <label className="check"><input type="radio" name="send_offers" value="no" defaultChecked /> Don’t send offer letters (staff who already signed a contract)</label>
              </fieldset>
              <p><button>➕ Add {ready.length} {ready.length === 1 ? 'person' : 'people'}</button></p>
            </form>
          ) : <p className="message">Nobody can be added from this file. Fix the problems and upload it again.</p>}
          <form action={cancelImport}><input type="hidden" name="batch" value={batch.id} /><button className="secondary small">Cancel this import</button></form>
        </section>
      )}

      {batch && batch.status !== 'Preview' && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>{batch.status === 'Cancelled' ? 'Import cancelled' : 'Import done'} — {batch.file_name}</h2>
          {batch.status === 'Imported' && !batch.results && <p className="message">The import is still running or was interrupted. Refresh in a minute; anyone already added appears on the HR list.</p>}
          {batch.results && (
            <table>
              <thead><tr><th>Person</th><th>Result</th><th>Notes</th></tr></thead>
              <tbody>{batch.results.map((r, i) => (
                <tr key={i}><td>{r.profile_id ? <Link href={`/hr/${r.profile_id}`}>{r.name}</Link> : r.name}<div className="small muted">{r.email ?? ''}</div></td>
                  <td>{r.status === 'added' ? '✅ Added' : r.status === 'skipped' ? '⏭ Skipped' : '❌ Failed'}</td><td className="small">{r.note}</td></tr>))}
              </tbody>
            </table>
          )}
          <p><Link href="/admin/import">Import another file</Link> · <Link href="/admin/go-live">Opening-day readiness</Link></p>
        </section>
      )}

      {!batch && (past ?? []).length > 0 && (
        <>
          <h2>Past imports</h2>
          <table><tbody>{past.map((b) => (
            <tr key={b.id}><td><Link href={`/admin/import?batch=${b.id}`}>{b.file_name}</Link></td><td className="small">{fmtDateTime(b.imported_at ?? b.created_at)}</td>
              <td className="small">{b.status === 'Cancelled' ? 'Cancelled' : `${(b.results ?? []).filter((r) => r.status === 'added').length} added`}</td></tr>))}
          </tbody></table>
        </>
      )}
    </main>
  );
}
