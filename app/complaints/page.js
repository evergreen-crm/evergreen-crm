// 📣 Complaints register. Anyone on staff can log a complaint they receive (from a person we support, family,
// representative, neighbour or staff). Coordinators (level 2) and up, and HR, see the register, record every step
// taken, the reason a complaint is resolved and a follow-up date (the CRM reminds the owner on that date).
// A complaint about a staff member goes to the level above them, and that person cannot see it.
// Timelines: log within 1 business day, acknowledge within 2, informal resolution within 10, written response within 30 days.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf, groupOf, personLabel } from '@/lib/levels';
import { fmtDate, todayISO } from '@/lib/options';
import { plainError } from '@/lib/plain';
import { logComplaint, updateComplaint, addComplaintStep } from './actions';

export const dynamic = 'force-dynamic';

const CHANNELS = ['In person', 'Phone', 'Email', 'Letter', 'Tell us form', 'Client portal', 'Through staff', 'Other'];
const STEPS = ['Logged', 'Acknowledged', 'Informal resolution', 'Formal review', 'Resolved', 'Withdrawn'];
const colour = (s) => (['Resolved', 'Withdrawn'].includes(s) ? 'green' : s === 'Logged' ? 'red' : 'yellow');

export default async function Complaints({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const canManage = profile.role === 'admin' || levelOf(profile) >= 2 || groupOf(profile) === 'hr';
  const open = sp.show !== 'all';
  const [{ data: residents }, { data: staff }, list] = await Promise.all([
    supabase.from('residents').select('id, first_name, preferred_name, last_name, home_id').is('discharge_date', null).order('first_name'),
    supabase.from('profiles').select('id, full_name, role, level, staff_group').eq('active', true).neq('role', 'family').order('full_name'),
    canManage ? (() => {
      let q = supabase.from('complaints').select('id, complaint_no, received_at, channel, from_who, summary, step, acknowledged_at, resolved_at, outcome, resolution_reason, follow_up_on, satisfied, told_can_go_to_funder, resident:resident_id(first_name, preferred_name), home:home_id(name), receiver:received_by(full_name), about:about_profile_id(full_name, level), steps:complaint_steps(id, taken_on, action, created_at, by:by_profile_id(full_name))');
      if (open) q = q.not('step', 'in', '("Resolved","Withdrawn")');
      return q.order('received_at', { ascending: false }).limit(300);
    })() : Promise.resolve({ data: [] }),
  ]);
  const rows = list.data ?? [];
  const missing = list.error && /relation|schema/i.test(list.error.message);
  const today = todayISO();

  return (
    <main className="report">
      <h1>📣 Complaints</h1>
      <p className="small muted">Everyone has the right to raise a concern without fear of reprisal. Log every complaint the same day. People can also complain directly to CLBC, MCFD, the Representative for Children and Youth or the Ombudsperson — tell them so. HR receives a copy of every complaint.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {(sp.error || (list.error && !missing)) && <p className="message error">{plainError(sp.error ?? list.error.message)}</p>}
      {missing && <p className="message">The complaints register is not installed yet (Phase 2 SQL).</p>}

      <form action={logComplaint} className="card no-print">
        <h2>Log a complaint</h2>
        <div className="row">
          <label>How it came in<select name="channel" defaultValue="In person">{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>From (person, family member, representative, staff…)<input name="from_who" maxLength={200} /></label>
          <label>About the person we support (optional)<select name="resident_id" defaultValue=""><option value="">—</option>{(residents ?? []).map((r) => <option key={r.id} value={r.id}>{r.preferred_name || r.first_name} {r.last_name ?? ''}</option>)}</select></label>
        </div>
        <label>Is the complaint about a staff member? (optional — it then goes to the level above them, and they will not see it)
          <select name="about_profile_id" defaultValue=""><option value="">No / not about staff</option>{(staff ?? []).filter((p) => p.id !== user.id).map((p) => <option key={p.id} value={p.id}>{p.full_name} ({personLabel(p)})</option>)}</select>
        </label>
        <label>What is the complaint? (their words where you can)<textarea name="summary" rows={3} maxLength={4000} required /></label>
        <label className="inline"><input type="checkbox" name="told_can_go_to_funder" /> I told them they can also complain directly to CLBC / MCFD / RCY / the Ombudsperson</label>
        <button>Log complaint</button>
      </form>

      {canManage && !missing && (<>
        <p className="small no-print">{open ? <><strong>Open</strong> · <Link href="/complaints?show=all">All</Link></> : <><Link href="/complaints">Open</Link> · <strong>All</strong></>}</p>
        {!rows.length ? <p className="card muted small">No {open ? 'open ' : ''}complaints.</p> : rows.map((c) => {
          const steps = [...(c.steps ?? [])].sort((a, b) => (a.taken_on + a.created_at).localeCompare(b.taken_on + b.created_at));
          return (
            <section key={c.id} id={`c-${c.id}`} className={`card qa-std qa-std-${colour(c.step)}`}>
              <div className="title-row">
                <strong>{c.complaint_no} · {c.step}</strong>
                <span className="small muted">{fmtDate(c.received_at.slice(0, 10))} · {c.channel ?? '—'}{c.from_who ? ` · from ${c.from_who}` : ''}{c.resident ? ` · about ${c.resident.preferred_name || c.resident.first_name}` : ''}{c.home?.name ? ` · ${c.home.name}` : ''} · logged by {c.receiver?.full_name ?? '—'}</span>
              </div>
              {c.about && <p className="small"><strong>About staff member:</strong> {c.about.full_name} — handled by the level above; they cannot see this complaint.</p>}
              <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{c.summary}</p>
              <p className="small muted">Acknowledged: {c.acknowledged_at ? fmtDate(c.acknowledged_at.slice(0, 10)) : 'not yet'} · Closed: {c.resolved_at ? fmtDate(c.resolved_at.slice(0, 10)) : 'open'}{c.follow_up_on ? ` · Follow-up: ${fmtDate(c.follow_up_on)}${c.follow_up_on < today ? ' (due)' : ''}` : ''}{c.satisfied != null ? ` · Satisfied: ${c.satisfied ? 'yes' : 'no'}` : ''}</p>

              <h3 className="small" style={{ marginBottom: 4 }}>Steps taken ({steps.length})</h3>
              {steps.length ? (
                <ol className="small" style={{ marginTop: 0 }}>{steps.map((s) => <li key={s.id}><strong>{fmtDate(s.taken_on)}</strong> — {s.action} <span className="muted">({s.by?.full_name ?? '—'})</span></li>)}</ol>
              ) : <p className="small muted">No steps recorded yet. A complaint cannot be closed until the steps taken are recorded.</p>}
              <form action={addComplaintStep} className="row no-print">
                <input type="hidden" name="id" value={c.id} />
                <label>Date<input type="date" name="taken_on" defaultValue={today} /></label>
                <label style={{ flex: 3 }}>What was done (who was spoken to, what was agreed, what changed)<input name="action" maxLength={4000} required /></label>
                <button className="secondary">Add step</button>
              </form>

              {c.resolution_reason && <p className="small"><strong>Why it is resolved:</strong> {c.resolution_reason}</p>}
              <form action={updateComplaint} className="qa-std-form no-print">
                <input type="hidden" name="id" value={c.id} />
                <div className="row">
                  <label>Step<select name="step" defaultValue={c.step}>{STEPS.map((s) => <option key={s}>{s}</option>)}</select></label>
                  <label>Follow-up date (reminder)<input type="date" name="follow_up_on" defaultValue={c.follow_up_on ?? ''} /></label>
                  <label>Satisfied with the outcome?<select name="satisfied" defaultValue={c.satisfied == null ? '' : c.satisfied ? 'yes' : 'no'}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select></label>
                </div>
                <label>Outcome (what we did)<textarea name="outcome" rows={2} maxLength={4000} defaultValue={c.outcome ?? ''} /></label>
                <label>Why it is resolved (required to close)<textarea name="resolution_reason" rows={2} maxLength={4000} defaultValue={c.resolution_reason ?? ''} /></label>
                <label className="inline"><input type="checkbox" name="told_can_go_to_funder" defaultChecked={c.told_can_go_to_funder} /> Told about CLBC / MCFD / RCY / Ombudsperson</label>
                <button>Save</button>
              </form>
            </section>
          );
        })}
      </>)}
    </main>
  );
}
