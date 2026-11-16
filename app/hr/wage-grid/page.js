// 📊 Wage grid: Evergreen's hourly rates by grid level and step, one grid per effective date (the BC community
// social services JJEP grid is the benchmark and changes each year). Positions are linked to a grid level on the
// Pay rates page; automatic offer letters take Step 1 for the start date, and show the later steps.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canHR, canPayroll, levelOf, groupOf } from '@/lib/levels';
import { plainError } from '@/lib/plain';
import { fmtDate } from '@/lib/options';
import { saveGrid, raiseGrid } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Wage grid · Evergreen' };

export default async function WageGrid({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!(canHR(profile) || canPayroll(profile))) redirect('/?error=' + encodeURIComponent('The wage grid is for HR, Payroll and managers.'));
  const canEdit = profile.role === 'admin' || (levelOf(profile) >= 5 && !groupOf(profile));
  const [{ data: all, error }, { data: positions }] = await Promise.all([
    supabase.from('wage_grid').select('effective_date, grid_level, step, hourly_rate').order('effective_date', { ascending: false }).order('grid_level').order('step'),
    supabase.from('pay_rates').select('position, grid_level, active').eq('active', true).order('sort'),
  ]);
  const dates = [...new Set((all ?? []).map((r) => r.effective_date))];
  const today = new Date().toISOString().slice(0, 10);
  const inForce = dates.find((d) => d <= today) ?? dates[dates.length - 1];
  const show = sp.date && dates.includes(sp.date) ? sp.date : inForce;
  const rows = (all ?? []).filter((r) => r.effective_date === show);
  const levels = [...new Set(rows.map((r) => r.grid_level))].sort((a, b) => a - b);
  const maxStep = Math.max(3, ...rows.map((r) => r.step));
  const rate = (l, s) => rows.find((r) => r.grid_level === l && r.step === s)?.hourly_rate;
  const who = (l) => (positions ?? []).filter((p) => p.grid_level === l).map((p) => p.position).join(', ');
  const money = (n) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);
  const next = new Date(); next.setMonth(3, 1); if (next.toISOString().slice(0, 10) <= today) next.setFullYear(next.getFullYear() + 1);

  return (
    <main>
      <p className="small no-print"><Link href="/hr/pay-rates">← Pay rates</Link></p>
      <h1>📊 Wage grid</h1>
      <p className="small">Hourly rates by grid level and step. Each position is linked to a grid level on <Link href="/hr/pay-rates">Pay rates</Link>; an automatic offer letter takes Step 1 of the grid in force on the start date and shows the later steps. Staff move up a step after each 2,000 hours worked.</p>
      <p className="small muted">Benchmark: the BC Community Social Services (CSSEA JJEP) wage grid, which changes each year (usually April 1). Add the new year’s grid with its start date; older grids stay for history, and letters already sent keep their rates.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{plainError(sp.error)}</p>}
      {error && <p className="message">The wage grid isn’t switched on yet (setup file: offer-letter-v3.sql).</p>}

      {!!dates.length && (
        <p className="small">Grids: {dates.map((d, i) => <span key={d}>{i ? ' · ' : ''}<Link href={`/hr/wage-grid?date=${d}`} className={d === show ? 'badge' : ''}>{fmtDate(d)}{d === inForce ? ' (in force)' : d > today ? ' (future)' : ''}</Link></span>)}</p>
      )}

      {canEdit ? (
        <form action={saveGrid} className="card">
          <h2 style={{ marginTop: 0 }}>Grid starting {show ? fmtDate(show) : '—'}</h2>
          <label style={{ maxWidth: 260 }}>Starts on<input type="date" name="effective" required defaultValue={show ?? ''} /></label>
          <p className="small muted">To add next year’s grid, change the date and type the new rates, or use the % form below. Saving replaces the grid for that date.</p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Grid level</th>{Array.from({ length: maxStep }, (_, i) => <th key={i}>Step {i + 1}</th>)}<th>Evergreen positions</th></tr></thead>
              <tbody>
                {levels.map((l) => (
                  <tr key={l}>
                    <td><strong>{l}</strong></td>
                    {Array.from({ length: maxStep }, (_, i) => (
                      <td key={i}><input name={`r_${l}_${i + 1}`} type="number" step="0.01" min="1" max="499" inputMode="decimal" defaultValue={rate(l, i + 1) ?? ''} aria-label={`Grid ${l} step ${i + 1}`} style={{ width: 92 }} /></td>
                    ))}
                    <td className="small">{who(l) || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button>Save grid</button>
        </form>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Grid level</th>{Array.from({ length: maxStep }, (_, i) => <th key={i}>Step {i + 1}</th>)}<th>Evergreen positions</th></tr></thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l}><td><strong>{l}</strong></td>{Array.from({ length: maxStep }, (_, i) => <td key={i}>{money(rate(l, i + 1))}</td>)}<td className="small">{who(l) || '—'}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">Only the Executive Director, CSO, CEO and Administrator can change the grid.</p>
        </div>
      )}

      {canEdit && !!dates.length && (
        <form action={raiseGrid} className="card">
          <h2 style={{ marginTop: 0 }}>Next year’s grid from a % increase</h2>
          <p className="small">Copies the latest earlier grid and raises every rate. For example, the 2025–2029 sector agreement adds 3% on April 1, 2027 and April 1, 2028.</p>
          <div className="row">
            <label>Starts on<input type="date" name="effective" required defaultValue={next.toISOString().slice(0, 10)} /></label>
            <label>Increase (%)<input name="pct" type="number" step="0.01" min="-19" max="49" required defaultValue="3" /></label>
          </div>
          <button>Make the new grid</button>
        </form>
      )}
      <p className="small muted">Every change is kept in the security audit log.</p>
    </main>
  );
}
