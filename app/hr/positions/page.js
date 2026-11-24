// 🧭 Positions (Phase A1 of the Roles plan, Nov 24 2026): every Evergreen position with its access level, who it
// reports to, its program, how it is paid, the pay positions HR uses for it, and who holds it now. Positions that
// are not filled yet are listed too, so the CRM is ready the day someone is hired.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canHR, canPayroll, levelOf, levelName } from '@/lib/levels';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Positions · Evergreen' };

const PAY = { hourly: 'Hourly (wage grid)', salary: 'Salary', none: 'Not paid (appointed)' };
const PROG = { MCFD: 'MCFD (children & youth)', CLBC: 'CLBC (adults)', Both: 'MCFD and CLBC' };

export default async function Positions() {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!(canHR(profile) || canPayroll(profile) || levelOf(profile) >= 3)) redirect('/?error=' + encodeURIComponent('Positions are for HR, Payroll and managers.'));
  const [{ data: positions, error }, { data: payRates }, { data: plans }, { data: people }] = await Promise.all([
    supabase.from('positions').select('*').eq('active', true).order('sort'),
    supabase.from('pay_rates').select('position, position_key, active').eq('active', true).order('sort'),
    supabase.from('pay_plans').select('position, pay_type, grid_level, hourly_rate, annual_salary'),
    supabase.from('staff_details').select('profile_id, position, also_roles, employment_status, profiles!inner(full_name, active)').eq('profiles.active', true),
  ]);
  if (error) return <main><h1>Positions</h1><p className="message">The positions list is not set up yet ({error.message}).</p></main>;
  const title = (k) => positions.find((p) => p.key === k)?.title ?? '—';
  const payFor = (key) => (payRates ?? []).filter((r) => r.position_key === key);
  const paySet = (name) => { const p = (plans ?? []).find((x) => x.position === name); return !!(p && (p.grid_level || p.hourly_rate || p.annual_salary)); };
  const holders = (key) => {
    const names = new Set(payFor(key).map((r) => r.position));
    return (people ?? []).filter((x) => names.has(x.position) || (x.also_roles ?? []).includes(key)).map((x) => x.profiles?.full_name).filter(Boolean);
  };
  const open = positions.filter((p) => holders(p.key).length === 0).length;

  return (
    <main>
      <p className="small"><Link href="/hr">← HR & People</Link> · <Link href="/hr/pay-rates">💲 Pay rates</Link></p>
      <h1>🧭 Positions</h1>
      <p className="muted">Every position at Evergreen, who it reports to and how it is paid. {positions.length} positions · {open} not filled yet. Pay is entered by HR and Payroll on <Link href="/hr/pay-rates">Pay rates</Link> and goes into each person’s offer letter automatically. A person’s position is chosen on their staff file (Details).</p>
      <table>
        <thead><tr><th>Position</th><th>CRM access</th><th>Reports to</th><th>Program</th><th>Pay</th><th>Held by</th></tr></thead>
        <tbody>
          {positions.map((p) => {
            const pay = payFor(p.key);
            const who = holders(p.key);
            return (
              <tr key={p.key}>
                <td><strong>{p.title}</strong>{p.also_role && <span className="badge">can be a second role</span>}<div className="muted small">{p.summary}</div></td>
                <td className="small">Level {p.level} · {p.staff_group ? p.staff_group.toUpperCase() : levelName(p.level)}</td>
                <td className="small">{p.reports_to ? title(p.reports_to) : 'Members (governance)'}</td>
                <td className="small">{PROG[p.program]}</td>
                <td className="small">{PAY[p.pay_basis]}
                  {pay.map((r) => <div key={r.position} className="muted">{r.position}: {paySet(r.position) ? 'pay set ✓' : 'pay not set yet'}</div>)}
                </td>
                <td className="small">{who.length ? who.join(', ') : <span className="muted">Not filled yet</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small muted">The role charter for each position (its duties by day, week, month and year) comes next and will be linked here.</p>
    </main>
  );
}
