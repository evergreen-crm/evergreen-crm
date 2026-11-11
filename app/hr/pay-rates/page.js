// 💲 Pay rates: one hourly rate per position. Offer letters take the wage from here, so coordinators never type one.
// Seen by HR, Payroll, Program Managers and above. Changed only by the Executive Director, CSO, CEO and Administrator.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canHR, canPayroll, levelOf, groupOf } from '@/lib/levels';
import { plainError } from '@/lib/plain';
import { fmtDate } from '@/lib/options';
import { savePayRate } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pay rates · Evergreen' };

export default async function PayRates({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!(canHR(profile) || canPayroll(profile))) redirect('/?error=' + encodeURIComponent('Pay rates are for HR, Payroll and managers.'));
  const canEdit = profile.role === 'admin' || (levelOf(profile) >= 5 && !groupOf(profile));
  const [{ data: rates, error }, { data: waiting }] = await Promise.all([
    supabase.from('pay_rates').select('id, position, hourly_rate, active, updated_at').order('sort').order('position'),
    supabase.from('offer_letters').select('id, position, profiles!offer_letters_profile_id_fkey(full_name)').eq('auto', true).eq('status', 'Draft').is('wage', null),
  ]);
  const money = (n) => (n == null ? null : `$${Number(n).toFixed(2)}`);
  return (
    <main>
      <p className="small no-print"><Link href="/s/hr">← HR & People</Link></p>
      <h1>💲 Pay rates</h1>
      <p className="small">One hourly rate for each position. Offer letters take the wage from this table. {canEdit ? 'Saving a rate sends any offer letters that were waiting for it.' : 'Only the Executive Director, CSO, CEO and Administrator can change a rate.'}</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{plainError(sp.error)}</p>}
      {error && <p className="message">Pay rates aren’t switched on yet (setup file: auto-offer.sql).</p>}
      {!!(waiting ?? []).length && (
        <p className="message">⏳ <strong>Waiting for a pay rate:</strong> {waiting.map((w, i) => <span key={w.id}>{i ? ', ' : ''}<Link href={`/offer/${w.id}`}>{w.profiles?.full_name ?? 'Offer'} ({w.position})</Link></span>)}</p>
      )}
      <table>
        <thead><tr><th>Position</th><th>Hourly rate</th><th>Last changed</th>{canEdit && <th>Change</th>}</tr></thead>
        <tbody>
          {(rates ?? []).map((r) => (
            <tr key={r.id}>
              <td>{r.position}{!r.active && <span className="badge bad"> Not in use</span>}</td>
              <td>{money(r.hourly_rate) ?? <span className="badge warn">Not set</span>}</td>
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
            <label>Hourly rate ($)<input name="rate" type="number" step="0.01" min="1" max="500" inputMode="decimal" required placeholder="e.g. 27.50" /></label>
          </div>
          <button>Add</button>
        </form>
      )}
      <p className="small muted">Every change is kept in the security audit log.</p>
    </main>
  );
}
