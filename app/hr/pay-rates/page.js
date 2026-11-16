// 💲 Pay rates: one hourly rate per position. Offer letters take the wage from here, so coordinators never type one.
// Seen by HR, Payroll, Program Managers and above. Changed only by the Executive Director, CSO, CEO and Administrator.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canHR, canPayroll, levelOf, groupOf } from '@/lib/levels';
import { plainError } from '@/lib/plain';
import { fmtDate } from '@/lib/options';
import { savePayRate, saveGridLevel } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pay rates · Evergreen' };

export default async function PayRates({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!(canHR(profile) || canPayroll(profile))) redirect('/?error=' + encodeURIComponent('Pay rates are for HR, Payroll and managers.'));
  const canEdit = profile.role === 'admin' || (levelOf(profile) >= 5 && !groupOf(profile));
  const [{ data: rates, error }, { data: waiting }] = await Promise.all([
    supabase.from('pay_rates').select('id, position, hourly_rate, grid_level, active, updated_at').order('sort').order('position'),
    supabase.from('offer_letters').select('id, position, profiles!offer_letters_profile_id_fkey(full_name)').eq('auto', true).eq('status', 'Draft').is('wage', null),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const { data: gridAll } = await supabase.from('wage_grid').select('effective_date, grid_level, step, hourly_rate').lte('effective_date', today).order('effective_date', { ascending: false });
  const gridDate = gridAll?.[0]?.effective_date ?? null;
  const grid = (gridAll ?? []).filter((g) => g.effective_date === gridDate);
  const gridLevels = [...new Set(grid.map((g) => g.grid_level))].sort((a, b) => a - b);
  const step1 = (l) => grid.find((g) => g.grid_level === l && g.step === 1)?.hourly_rate;
  const money = (n) => (n == null ? null : `$${Number(n).toFixed(2)}`);
  return (
    <main>
      <p className="small no-print"><Link href="/s/hr">← HR & People</Link></p>
      <h1>💲 Pay rates</h1>
      <p className="small">One hourly rate for each position. Offer letters take the wage from this table. {canEdit ? 'Saving a rate sends any offer letters that were waiting for it.' : 'Only the Executive Director, CSO, CEO and Administrator can change a rate.'}</p>
      <p className="small muted">Each position is linked to a level of the <Link href="/hr/wage-grid">📊 wage grid</Link> (the BC Community Social Services grid, updated each year). The offer letter takes Step 1 of the grid in force on the start date. A position with no grid level (for example Program Manager) uses its fixed hourly rate. A letter already sent keeps the rate it was sent with.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{plainError(sp.error)}</p>}
      {error && <p className="message">Pay rates aren’t switched on yet (setup file: auto-offer.sql).</p>}
      {!!(waiting ?? []).length && (
        <p className="message">⏳ <strong>Waiting for a pay rate:</strong> {waiting.map((w, i) => <span key={w.id}>{i ? ', ' : ''}<Link href={`/offer/${w.id}`}>{w.profiles?.full_name ?? 'Offer'} ({w.position})</Link></span>)}</p>
      )}
      <table>
        <thead><tr><th>Position</th><th>Grid level</th><th>Starting rate</th><th>Last changed</th>{canEdit && <th>Change</th>}</tr></thead>
        <tbody>
          {(rates ?? []).map((r) => (
            <tr key={r.id}>
              <td>{r.position}{!r.active && <span className="badge bad"> Not in use</span>}</td>
              <td>
                {canEdit ? (
                  <form action={saveGridLevel} style={{ display: 'flex', gap: 6 }}>
                    <input type="hidden" name="position" value={r.position} />
                    <select name="level" defaultValue={r.grid_level ?? ''} aria-label={`Grid level for ${r.position}`}>
                      <option value="">Fixed rate</option>
                      {[...new Set([...gridLevels, ...(r.grid_level ? [r.grid_level] : [])])].sort((a, b) => a - b).map((l) => <option key={l} value={l}>Grid {l}</option>)}
                    </select>
                    <button className="secondary">Set</button>
                  </form>
                ) : (r.grid_level ? `Grid ${r.grid_level}` : 'Fixed rate')}
              </td>
              <td>{r.grid_level && step1(r.grid_level) != null ? <>{money(step1(r.grid_level))} <span className="small muted">(grid, Step 1)</span></> : (money(r.hourly_rate) ?? <span className="badge warn">Not set</span>)}</td>
              <td className="small muted">{r.hourly_rate != null ? fmtDate(String(r.updated_at).slice(0, 10)) : '—'}</td>
              {canEdit && (
                <td>
                  <form action={savePayRate} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="hidden" name="position" value={r.position} />
                    <input name="rate" type="number" step="0.01" min="1" max="500" inputMode="decimal" required defaultValue={r.hourly_rate ?? ''} placeholder="e.g. 27.50" aria-label={`Hourly rate for ${r.position}`} style={{ width: 120 }} />
                    <select name="active" defaultValue={r.active ? '1' : '0'} aria-label="In use"><option value="1">In use</option><option value="0">Not in use</option></select>
                    <button>Save</button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <form action={savePayRate} className="card">
          <h2 style={{ marginTop: 0 }}>Add a position</h2>
          <div className="row">
            <label>Position<input name="position" required maxLength={80} placeholder="e.g. Awake Night Worker" /></label>
            <label>Fixed hourly rate ($)<input name="rate" type="number" step="0.01" min="1" max="500" inputMode="decimal" required placeholder="e.g. 27.50" /></label>
          </div>
          <button>Add</button>
        </form>
      )}
      <p className="small muted">Every change is kept in the security audit log.</p>
    </main>
  );
}
