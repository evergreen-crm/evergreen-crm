// 🪪 Staff compliance (COA HR and TS): per house, then per person —
// cleared to work, criminal record check, First Aid & CPR, NVCI, mandatory training and policy sign-offs.
import Link from 'next/link';
import { fmtDate, addDaysISO } from '@/lib/options';
import { loadKpiData, computeKpis, detectIssues } from '@/lib/kpis';
import { filterForHome } from '@/lib/houseKpis';
import { levelOf, groupOf, personLabel } from '@/lib/levels';
import { requireQa } from '../guard';
import QaShell from '../QaShell';
import Cell from '../Cell';

export const dynamic = 'force-dynamic';
const ROWS = [
  ['crc', 'Criminal record checks current'], ['credentials', 'Credentials current'], ['training', 'Mandatory training'],
  ['policy_signoff', 'Policy sign-offs'], ['onboarding', 'Onboarding'], ['shift_coverage', 'Shift coverage (7 days)'],
];
// Same grouping as cert_kind() in supabase/cert-expiry.sql.
const kindOf = (t) => (/criminal/i.test(t) ? 'crc' : /first aid/i.test(t) ? 'first_aid' : /nvci|crisis intervention/i.test(t) ? 'nvci' : 'other');

export default async function QaStaff() {
  const { supabase, profile } = await requireQa('/qa/staff');
  const d = await loadKpiData(supabase);
  const homes = d.homes ?? [];
  const orgBy = Object.fromEntries(computeKpis(d).map((k) => [k.key, k]));
  const houseBy = Object.fromEntries(homes.map((h) => [h.id, Object.fromEntries(computeKpis(filterForHome(d, h.id)).map((k) => [k.key, k]))]));
  const homeName = Object.fromEntries(homes.map((h) => [h.id, h.name]));

  // People who work in the houses (frontline, coordinators, managers).
  const staff = (d.profiles ?? []).filter((p) => p.active && p.role !== 'family' && p.role !== 'admin' && !groupOf(p) && levelOf(p) <= 3)
    .sort((a, b) => (homeName[a.home_id] ?? 'zz').localeCompare(homeName[b.home_id] ?? 'zz') || a.full_name.localeCompare(b.full_name));
  const det = Object.fromEntries((d.details ?? []).map((x) => [x.profile_id, x]));
  const { data: certRows } = await supabase.from('certifications').select('profile_id, cert_type, issued_on, expires_on');
  const until = (pid, kind) => {
    let best = null;
    for (const c of certRows ?? []) {
      if (c.profile_id !== pid || kindOf(c.cert_type) !== kind) continue;
      const u = c.expires_on ?? (kind === 'crc' && c.issued_on ? addDaysISO(c.issued_on, 1826) : '9999-12-31');
      if (!best || u > best) best = u;
    }
    return best;
  };
  const clearance = await Promise.all(staff.map(async (p) => { const { data } = await supabase.rpc('cleared_on', { p_profile: p.id }); return data ?? null; }));
  const issues = detectIssues(d).filter((i) => i.kind === 'staff');
  const issuesOf = (pid) => issues.filter((i) => i.subject_profile_id === pid);
  const today = d.today;
  const certCell = (u) => {
    if (!u) return <td className="qa-cell qa-red">None on file</td>;
    if (u === '9999-12-31') return <td className="qa-cell qa-green">On file</td>;
    if (u < today) return <td className="qa-cell qa-red">Expired {fmtDate(u)}</td>;
    if (u <= addDaysISO(today, 30)) return <td className="qa-cell qa-yellow">Expires {fmtDate(u)}</td>;
    return <td className="qa-cell qa-green">to {fmtDate(u)}</td>;
  };
  const notCleared = clearance.filter(Boolean).length;

  return (
    <QaShell active="/qa/staff" title="Quality assurance — staff compliance" printedBy={profile.full_name}
      intro="COA HR (Human Resources) and TS (Training and Supervision). Anyone not cleared to work can't be scheduled. Fix records in HR.">
      <nav className="qa-quickbar no-print" aria-label="Enter">
        <strong className="small" style={{ alignSelf: 'center' }}>Enter &amp; save:</strong>
        <Link className="button secondary" href="/hr">🪪 Certificates & training (HR files)</Link>
        <Link className="button secondary" href="/probation">📝 Probation reviews</Link>
        <Link className="button secondary" href="/qa/records/inspections#new">🔎 Outside review (e.g. MCFD screening audit)</Link>
        <Link className="button secondary" href="/qa/actions?new=1&std=HR">🛠 Improvement action</Link>
      </nav>
      <section className="qa-summary">
        <div className={`qa-score kpi-${notCleared ? 'red' : 'green'}`}><span className="small muted">Not cleared to work</span><strong>{notCleared}</strong><span className="small">of {staff.length} house staff</span></div>
        <div className={`qa-score kpi-${orgBy.training?.status ?? 'none'}`}><span className="small muted">Mandatory training</span><strong>{orgBy.training?.value ?? '—'}</strong><span className="small">all houses</span></div>
        <div className={`qa-score kpi-${orgBy.policy_signoff?.status ?? 'none'}`}><span className="small muted">Policy sign-offs</span><strong>{orgBy.policy_signoff?.value ?? '—'}</strong><span className="small">current versions</span></div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>By house</h2>
        <div className="table-wrap">
          <table className="qa-table">
            <thead><tr><th>Measure</th><th>All of Evergreen</th>{homes.map((h) => <th key={h.id}>{h.name}</th>)}</tr></thead>
            <tbody>{ROWS.map(([k, label]) => (
              <tr key={k}><td>{label}</td><Cell k={orgBy[k]} />{homes.map((h) => <Cell key={h.id} k={houseBy[h.id][k]} />)}</tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>By person</h2>
        {!staff.length ? <p className="muted small">No house staff yet.</p> : (
          <div className="table-wrap">
            <table className="qa-table">
              <thead><tr><th>Staff</th><th>House</th><th>Cleared to work</th><th>Criminal record check</th><th>First Aid & CPR</th><th>NVCI</th><th>Other issues</th></tr></thead>
              <tbody>{staff.map((p, i) => {
                const why = clearance[i]; const other = issuesOf(p.id);
                return (
                  <tr key={p.id}>
                    <td><Link href={`/hr/${p.id}`}>{p.full_name}</Link><br /><span className="muted small">{personLabel(p)}{det[p.id]?.hire_date ? ` · hired ${fmtDate(det[p.id].hire_date)}` : ''}</span></td>
                    <td className="small">{homeName[p.home_id] ?? '—'}</td>
                    <td className={`qa-cell qa-${why ? 'red' : 'green'}`}>{why ? <>❌ <span className="small">{why}</span></> : '✅ Cleared'}</td>
                    {certCell(until(p.id, 'crc'))}{certCell(until(p.id, 'first_aid'))}{certCell(until(p.id, 'nvci'))}
                    <td className="small">{other.length ? other.map((o) => <div key={o.source_key}>{o.severity === 'red' ? '🔴' : '🟡'} {o.title.replace(`${p.full_name}: `, '')}</div>) : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        <p className="muted small">First Aid & CPR is needed from day 8 and NVCI from day 91 after hire; a criminal record check without an expiry date counts for 5 years.</p>
      </section>
    </QaShell>
  );
}
