// 📋 Duty register: every duty from the MCFD and CLBC policies, who does it (by position level) and when the
// CRM creates the task. Duties run automatically every night (duty_engine_run). Admins can switch a duty on/off.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { LEVELS } from '@/lib/levels';
import { plainError } from '@/lib/plain';
import { toggleDuty } from './actions';

export const dynamic = 'force-dynamic';

const DOMAINS = { 1: 'Governance & Leadership', 2: 'Client Care & Clinical Practice', 3: 'Program Operations', 4: 'Human Resources', 5: 'Finance & Administration', 6: 'Quality Assurance', 7: 'Health, Safety & Emergency', 8: 'IT & Privacy', 9: 'Corporate Compliance', 10: 'Management & Leadership', 11: 'Policy Maps & Templates' };
const ROLE_NAMES = { support_worker: 'Support / youth care worker', home_lead: 'Home lead', program_coordinator: 'Program Coordinator', program_manager: 'Program Manager', clinical_lead: 'Clinical Lead', executive_director: 'Executive Director' };

function whenText(d) {
  if (d.trigger_kind === 'schedule') {
    const p = d.schedule_param;
    if (d.schedule === 'monthly') return `Monthly, ${p === 'last' ? 'last day' : `by day ${p || 1}`}`;
    if (d.schedule === 'quarterly') return `Quarterly${Number(p) ? `, ${p} days after quarter end` : ''}`;
    if (d.schedule === 'weekly') return 'Weekly (Friday)';
    const anchor = p === 'admission_anniversary' ? 'admission anniversary' : p === 'hire_anniversary' ? 'hire anniversary' : 'November 11 review';
    return `${d.schedule === 'semiannual' ? 'Every 6 months' : 'Yearly'} (${anchor})`;
  }
  if (d.trigger_kind === 'event') return `When: ${String(d.event_key || '').replaceAll('_', ' ')}${d.within_hours != null ? ` · within ${d.within_hours >= 48 ? `${Math.round(d.within_hours / 24)} days` : `${d.within_hours} hrs`}` : ''}`;
  if (d.trigger_kind === 'expiry') return `${d.remind_days} days before expiry`;
  if (d.trigger_kind === 'checklist') return 'On the shift checklist';
  return 'Standing rule (no due date)';
}

export default async function DutyRegister({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const isAdmin = profile.role === 'admin';
  let q = supabase.from('duties').select('id, duty_code, title, stream, domain, applies_to, owner_role, trigger_kind, schedule, schedule_param, event_key, within_hours, remind_days, proof, source_doc, source_ref, active').order('duty_code');
  if (['MCFD', 'CLBC', 'BOTH'].includes(sp.stream)) q = q.eq('stream', sp.stream);
  if (sp.show !== 'all') q = q.eq('active', true);
  const [{ data, error }, { data: roleLevels }] = await Promise.all([q.limit(400), supabase.from('duty_role_levels').select('owner_role, level')]);
  const levelOfRole = Object.fromEntries((roleLevels ?? []).map((r) => [r.owner_role, r.level]));
  let list = data ?? [];
  if (sp.level) list = list.filter((d) => String(levelOfRole[d.owner_role]) === sp.level);
  const missing = error && /relation|schema/i.test(error.message);
  const countFor = (lvl) => (data ?? []).filter((d) => d.active && levelOfRole[d.owner_role] === lvl).length;
  const link = (k, v) => { const p = new URLSearchParams({ ...sp, [k]: v }); if (!v) p.delete(k); return `/admin/duties?${p}`; };

  return (
    <main className="report">
      <h1>📋 Duty register &amp; levels</h1>
      <p className="small muted">Every duty from Evergreen&apos;s MCFD and CLBC policies. Each night the CRM creates the tasks that are due, emails the person at the right level, reminds them and escalates anything overdue to the next level up. Tasks go by position level, never by name.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {(sp.error || (error && !missing)) && <p className="message error">{plainError(sp.error ?? error.message)}</p>}
      {missing ? <p className="message">The duty register is not installed yet (Phase 1 SQL).</p> : (<>
        <h2>Levels</h2>
        <table className="small"><thead><tr><th>Level</th><th>Position</th><th>Access</th><th>Policy duties assigned</th></tr></thead>
          <tbody>{LEVELS.map((l) => {
            const roles = Object.entries(levelOfRole).filter(([, v]) => v === l.level).map(([k]) => ROLE_NAMES[k] ?? k);
            return <tr key={l.level}><td>{l.level}</td><td><strong>{l.name}</strong></td><td>{l.hint}</td>
              <td>{roles.length ? <Link href={link('level', String(l.level))}>{roles.join(', ')} ({countFor(l.level)})</Link> : <span className="muted">Takes duties when a lower level is empty</span>}</td></tr>;
          })}</tbody></table>

        <h2>Duties ({list.length})</h2>
        <p className="small">
          {[['', 'All programs'], ['MCFD', 'MCFD'], ['CLBC', 'CLBC'], ['BOTH', 'Both']].map(([k, l], i) => <span key={l}>{i ? ' · ' : ''}{(sp.stream ?? '') === k ? <strong>{l}</strong> : <Link href={link('stream', k)}>{l}</Link>}</span>)}
          {' — '}{sp.show === 'all' ? <Link href={link('show', '')}>Active only</Link> : <Link href={link('show', 'all')}>Include switched-off duties</Link>}
          {sp.level && <> · <Link href={link('level', '')}>All levels</Link></>}
        </p>
        <table className="small">
          <thead><tr><th>Code</th><th>Duty</th><th>Program</th><th>Level</th><th>When the task is created</th><th>Proof / source</th>{isAdmin && <th>On</th>}</tr></thead>
          <tbody>{list.map((d) => (
            <tr key={d.id} className={d.active ? '' : 'muted'}>
              <td>{d.duty_code}</td>
              <td>{d.title}<br /><span className="muted">{DOMAINS[d.domain]} · {d.applies_to}</span></td>
              <td>{d.stream}</td>
              <td>{levelOfRole[d.owner_role] ?? '—'} · {ROLE_NAMES[d.owner_role] ?? d.owner_role}</td>
              <td>{whenText(d)}</td>
              <td>{d.proof ? <>{d.proof}<br /></> : null}<span className="muted">{[d.source_doc, d.source_ref].filter(Boolean).join(' ')}</span></td>
              {isAdmin && <td><form action={toggleDuty}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="active" value={d.active ? 'false' : 'true'} /><button className="secondary">{d.active ? 'Turn off' : 'Turn on'}</button></form></td>}
            </tr>
          ))}</tbody>
        </table>
      </>)}
    </main>
  );
}
