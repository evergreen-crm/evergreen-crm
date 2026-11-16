// 💲 Pay rates: how each position is paid in each program (hourly from the wage grid or a fixed rate, or an annual
// salary for Program Coordinators and Program Managers, with on-call duty included). Payroll enters changes; a leader
// at level 4 to 8 approves them before they are used. Offer letters take the approved pay for the person's program.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canHR, canPayroll, levelOf, groupOf } from '@/lib/levels';
import { plainError } from '@/lib/plain';
import { fmtDate } from '@/lib/options';
import { requestPayChange, decidePayChange, cancelPayChange } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pay rates · Evergreen' };

const money = (n, unit) => (n == null ? null : unit === 'year'
  ? `$${Number(n).toLocaleString('en-CA', { maximumFractionDigits: 0 })} a year`
  : `$${Number(n).toFixed(2)} an hour`);
const PROG = { All: 'All programs', MCFD: 'MCFD (children & youth)', CLBC: 'CLBC (adults)' };

export default async function PayRates({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!(canHR(profile) || canPayroll(profile) || levelOf(profile) >= 3)) redirect('/?error=' + encodeURIComponent('Pay rates are for HR, Payroll and managers.'));
  const canRequest = profile.role === 'admin' || groupOf(profile) === 'payroll';
  const canApprove = profile.role === 'admin' || (levelOf(profile) >= 4 && levelOf(profile) <= 8 && !groupOf(profile));

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: positions }, { data: plans }, { data: changes }, { data: gridAll }] = await Promise.all([
    supabase.from('pay_rates').select('position, active, sort').order('sort'),
    supabase.from('pay_plans').select('position, program, pay_type, grid_level, hourly_rate, annual_salary, updated_at'),
    supabase.from('pay_changes').select('id, kind, position, program, pay_type, grid_level, hourly_rate, annual_salary, grid_effective, grid_rows, note, status, requested_by, requested_at, decided_at, decision_note, requester:profiles!pay_changes_requested_by_fkey(full_name), decider:profiles!pay_changes_decided_by_fkey(full_name)').order('requested_at', { ascending: false }).limit(40),
    supabase.from('wage_grid').select('effective_date, grid_level, step, hourly_rate').order('effective_date', { ascending: false }),
  ]);
  const gridDates = [...new Set((gridAll ?? []).map((g) => g.effective_date))];
  const gridDate = gridDates.find((d) => d <= today) ?? gridDates[gridDates.length - 1] ?? null;
  const grid = (gridAll ?? []).filter((g) => g.effective_date === gridDate);
  const levels = [...new Set(grid.map((g) => g.grid_level))].sort((a, b) => a - b);
  const step1 = (l) => grid.find((g) => g.grid_level === l && g.step === 1)?.hourly_rate;
  const plan = (pos, prog) => (plans ?? []).find((p) => p.position === pos && p.program === prog);
  const describe = (p) => {
    if (!p) return null;
    if (p.pay_type === 'salary') return p.annual_salary ? `Salary ${money(p.annual_salary, 'year')} (on-call included)` : 'Salary — not set';
    if (p.grid_level) return `Grid ${p.grid_level}${step1(p.grid_level) != null ? ` · starts ${money(step1(p.grid_level), 'hour')}` : ''}`;
    return p.hourly_rate ? `Fixed ${money(p.hourly_rate, 'hour')}` : null;
  };
  const pending = (changes ?? []).filter((c) => c.status === 'Pending');
  const history = (changes ?? []).filter((c) => c.status !== 'Pending').slice(0, 15);
  const what = (c) => c.kind === 'grid'
    ? `Wage grid starting ${fmtDate(c.grid_effective)} (${(c.grid_rows ?? []).length} rates)`
    : `${c.position} · ${PROG[c.program] ?? c.program} → ${c.pay_type === 'salary' ? `salary ${money(c.annual_salary, 'year')} (on-call included)` : c.grid_level ? `Grid ${c.grid_level}` : `fixed ${money(c.hourly_rate, 'hour')}`}`;

  return (
    <main>
      <p className="small no-print"><Link href="/hr">← HR & People</Link></p>
      <h1>💲 Pay rates</h1>
      <p className="small">How each position is paid in each program. <strong>Payroll</strong> enters a change after the CEO or CSO decides it; a leader at <strong>level 4 to 8</strong> (Director of Operations, Executive Director, CSO, CEO, Administrator) approves it. Nobody approves their own change. Offer letters use only approved pay, for the person’s program.</p>
      <p className="small muted">Hourly staff: a level of the <Link href="/hr/wage-grid">📊 wage grid</Link> (rises by step after each 2,000 hours) or a fixed rate. Program Coordinators and Program Managers: an annual salary, which includes on-call duty. A letter already sent keeps the pay it was sent with.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{plainError(sp.error)}</p>}

      {!!pending.length && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Waiting for approval ({pending.length})</h2>
          {pending.map((c) => (
            <div key={c.id} style={{ borderTop: '1px solid var(--line, #ddd)', padding: '8px 0' }}>
              <div><strong>{what(c)}</strong></div>
              <div className="small muted">Entered by {c.requester?.full_name ?? '—'} on {fmtDate(c.requested_at)}{c.note ? ` · “${c.note}”` : ''}</div>
              {canApprove && c.requested_by !== profile.id ? (
                <form action={decidePayChange} className="row" style={{ marginTop: 6 }}>
                  <input type="hidden" name="id" value={c.id} />
                  <input name="note" placeholder="Note (optional)" aria-label="Decision note" />
                  <button name="decision" value="approve">✓ Approve</button>
                  <button name="decision" value="reject" className="secondary">Reject</button>
                </form>
              ) : c.requested_by === profile.id ? (
                <form action={cancelPayChange} style={{ marginTop: 6 }}>
                  <input type="hidden" name="id" value={c.id} />
                  <span className="small muted">Waiting for a director to approve. </span><button className="link">Cancel my request</button>
                </form>
              ) : <span className="small muted">Waiting for a director at level 4 to 8.</span>}
            </div>
          ))}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Position</th><th>All programs</th><th>MCFD (children & youth)</th><th>CLBC (adults)</th></tr></thead>
          <tbody>
            {(positions ?? []).map((r) => (
              <tr key={r.position}>
                <td>{r.position}{!r.active && <span className="badge bad"> Not in use</span>}</td>
                <td>{describe(plan(r.position, 'All')) ?? <span className="badge warn">Not set</span>}</td>
                <td>{describe(plan(r.position, 'MCFD')) ?? <span className="small muted">same as all</span>}</td>
                <td>{describe(plan(r.position, 'CLBC')) ?? <span className="small muted">same as all</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canRequest ? (
        <form action={requestPayChange} className="card">
          <h2 style={{ marginTop: 0 }}>Enter a pay change (Payroll)</h2>
          <p className="small muted">Enter what the CEO or CSO decided. It is used only after a director at level 4 to 8 approves it.</p>
          <div className="row">
            <label>Position
              <input name="position" list="positions" required placeholder="e.g. Program Coordinator" />
              <datalist id="positions">{(positions ?? []).map((r) => <option key={r.position} value={r.position} />)}</datalist>
            </label>
            <label>Program
              <select name="program" defaultValue="All">
                <option value="All">All programs</option><option value="MCFD">MCFD (children & youth)</option><option value="CLBC">CLBC (adults)</option>
              </select>
            </label>
            <label>Pay type
              <select name="pay_type" defaultValue="hourly">
                <option value="hourly">Hourly</option><option value="salary">Annual salary (on-call included)</option>
              </select>
            </label>
          </div>
          <div className="row">
            <label>Grid level (hourly)
              <select name="grid_level" defaultValue="">
                <option value="">— fixed rate instead —</option>
                {levels.map((l) => <option key={l} value={l}>Grid {l}{step1(l) != null ? ` (starts ${money(step1(l), 'hour')})` : ''}</option>)}
              </select>
            </label>
            <label>Fixed hourly rate ($)<input name="hourly_rate" inputMode="decimal" placeholder="e.g. 30.22" /></label>
            <label>Annual salary ($)<input name="annual_salary" inputMode="decimal" placeholder="e.g. 72000" /></label>
          </div>
          <label>Note (who decided, why)<input name="note" placeholder="e.g. CEO decision, Nov 16 2026" /></label>
          <button>Send for approval</button>
        </form>
      ) : (
        <p className="small muted">Pay changes are entered by the Payroll team and approved by a director at level 4 to 8.</p>
      )}

      {!!history.length && (
        <details className="card">
          <summary>Recent decisions</summary>
          <table>
            <thead><tr><th>Change</th><th>Entered by</th><th>Decision</th></tr></thead>
            <tbody>
              {history.map((c) => (
                <tr key={c.id}>
                  <td>{what(c)}</td>
                  <td className="small">{c.requester?.full_name ?? '—'}<br />{fmtDate(c.requested_at)}</td>
                  <td className="small">{c.status}{c.decider?.full_name ? ` by ${c.decider.full_name}` : ''}{c.decided_at ? `, ${fmtDate(c.decided_at)}` : ''}{c.decision_note ? ` — “${c.decision_note}”` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <p className="small muted">Every change and decision is kept in the security audit log.</p>
    </main>
  );
}
