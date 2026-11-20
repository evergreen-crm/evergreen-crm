// 🔐 Monthly access review (plan B4). The Administrator checks who can see what, removes access that is no longer
// needed (on Access & departments or Admin), then signs off the month. The CEO can read it. supabase/access-review.sql
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf, levelName } from '@/lib/levels';
import { todayISO, fmtDate } from '@/lib/options';
import { signOffReview } from './actions';
import { flagsFor } from './flags';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Monthly access review · Evergreen' };

const fmt = (ts) => (ts ? new Date(new Date(ts).getTime() - 7 * 3600e3).toLocaleString('en-CA', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }) : 'Never');
const daysSince = (ts) => (ts ? Math.floor((Date.now() - new Date(ts)) / 86400000) : null);
const GROUP = { hr: 'HR', payroll: 'Payroll' };

export default async function AccessReview({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isAdmin = profile.role === 'admin';
  if (!isAdmin && !(levelOf(profile) >= 7 && !profile.staff_group)) redirect('/');
  const today = todayISO();
  const month = today.slice(0, 7) + '-01';
  const [{ data: people, error }, { data: reviews }] = await Promise.all([
    supabase.rpc('access_review_list'),
    supabase.from('access_reviews').select('id, review_month, reviewed_at, notes, flagged, by:reviewed_by(full_name)').order('review_month', { ascending: false }).limit(24),
  ]);
  const list = (people ?? []).map((p) => ({ ...p, flags: flagsFor(p, today) }));
  const active = list.filter((p) => p.active);
  const off = list.filter((p) => !p.active);
  const flagged = active.filter((p) => p.flags.length).length;
  const thisMonth = (reviews ?? []).find((r) => r.review_month === month);
  const monthName = new Date(month + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <main>
      <h1>🔐 Monthly access review</h1>
      <p className="muted">Once a month, check that everyone can see only what their job needs. Change access on <Link href="/admin/access">Access &amp; departments</Link> or turn an account off on <Link href="/admin">Admin</Link>, then sign off the month below. The CEO can read every review.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}
      {error && <p className="message">Could not load the list: {error.message}</p>}

      {thisMonth
        ? <p className="message ok">✅ {monthName} review signed off {fmt(thisMonth.reviewed_at)} by {thisMonth.by?.full_name ?? '—'}.</p>
        : <p className="message">⏳ The {monthName} review is not signed off yet.</p>}

      <div className="stats">
        <div className="stat"><strong>{active.length}</strong><span>accounts on</span></div>
        <div className={`stat ${flagged ? 'warn' : ''}`}><strong>{flagged}</strong><span>to check</span></div>
        <div className="stat"><strong>{active.filter((p) => (daysSince(p.last_sign_in) ?? 999) >= 30).length}</strong><span>no sign-in for 30 days</span></div>
        <div className="stat"><strong>{off.length}</strong><span>accounts off</span></div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Person</th><th>Access</th><th>Houses</th><th>Extra access</th><th>Last sign-in</th><th>Check</th></tr></thead>
          <tbody>{active.map((p) => (
            <tr key={p.id} style={p.flags.length ? { background: '#fff6e5' } : undefined}>
              <td><Link href={`/hr/${p.id}`}>{p.full_name}</Link><div className="muted small">{p.employee_no ?? ''}{p.job_position ? ` · ${p.job_position}` : ''}</div><div className="muted small">{p.email}</div></td>
              <td>{p.role === 'admin' ? 'Administrator' : p.staff_group ? GROUP[p.staff_group] ?? p.staff_group : levelName(p.level ?? (p.role === 'manager' ? 3 : 1))}</td>
              <td className="small">{p.home ?? '—'}{p.extra_homes ? <div>+ {p.extra_homes}</div> : null}</td>
              <td className="small">{[p.departments, p.prescreen && `Pre-screening: ${p.prescreen}`].filter(Boolean).join(' · ') || '—'}</td>
              <td className="small">{fmt(p.last_sign_in)}{p.added_by && <div className="muted">added by {p.added_by}</div>}</td>
              <td className="small">{p.flags.length ? p.flags.map((f, i) => <div key={i}>⚠ {f}</div>) : '✓'}</td>
            </tr>))}
          </tbody>
        </table>
      </div>

      {off.length > 0 && (
        <details className="card"><summary>Accounts that are off ({off.length})</summary>
          <table><tbody>{off.map((p) => (
            <tr key={p.id}><td>{p.full_name}</td><td className="small">{p.email}</td><td className="small">Last sign-in {fmt(p.last_sign_in)}</td><td className="small">{p.flags.join(' · ')}</td></tr>))}
          </tbody></table>
        </details>
      )}

      {isAdmin && !thisMonth && (
        <section className="card no-print">
          <h2 style={{ marginTop: 0 }}>Sign off the {monthName} review</h2>
          <form action={signOffReview}>
            <label>What you changed or checked (optional)<textarea name="notes" rows={3} maxLength={4000} placeholder="e.g. Turned off access for a staff member who left; confirmed the CSO still needs all houses." /></label>
            <button>✅ I reviewed everyone's access for {monthName}</button>
          </form>
          <p className="muted small">A copy of this list is kept with your sign-off for the audit.</p>
        </section>
      )}

      {(reviews ?? []).length > 0 && (
        <>
          <h2>Past reviews</h2>
          <table><thead><tr><th>Month</th><th>Signed off</th><th>To check at the time</th><th>Notes</th></tr></thead>
            <tbody>{reviews.map((r) => (
              <tr key={r.id}><td>{new Date(r.review_month + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</td>
                <td className="small">{fmt(r.reviewed_at)} · {r.by?.full_name ?? '—'}</td><td>{r.flagged}</td><td className="small">{r.notes ?? ''}</td></tr>))}
            </tbody></table>
        </>
      )}
    </main>
  );
}
