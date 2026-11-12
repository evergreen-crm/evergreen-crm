// 📣 Complaints register. Anyone on staff can log a complaint they receive (from a person we support, family,
// representative, neighbour or staff). Coordinators (level 2) and up see the register and move each complaint
// through its steps. Timelines: log within 1 business day, acknowledge within 2, informal resolution within 10,
// formal written response within 30 days.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import { plainError } from '@/lib/plain';
import { logComplaint, updateComplaint } from './actions';

export const dynamic = 'force-dynamic';

const CHANNELS = ['In person', 'Phone', 'Email', 'Letter', 'Tell us form', 'Client portal', 'Through staff', 'Other'];
const STEPS = ['Logged', 'Acknowledged', 'Informal resolution', 'Formal review', 'Resolved', 'Withdrawn'];
const colour = (s) => (['Resolved', 'Withdrawn'].includes(s) ? 'green' : s === 'Logged' ? 'red' : 'yellow');

export default async function Complaints({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const canManage = profile.role === 'admin' || levelOf(profile) >= 2;
  const open = sp.show !== 'all';
  const [{ data: residents }, list] = await Promise.all([
    supabase.from('residents').select('id, first_name, preferred_name, last_name, home_id').is('discharge_date', null).order('first_name'),
    canManage ? (() => {
      let q = supabase.from('complaints').select('id, complaint_no, received_at, channel, from_who, summary, step, acknowledged_at, resolved_at, outcome, satisfied, told_can_go_to_funder, resident:resident_id(first_name, preferred_name), home:home_id(name), receiver:received_by(full_name)');
      if (open) q = q.not('step', 'in', '("Resolved","Withdrawn")');
      return q.order('received_at', { ascending: false }).limit(300);
    })() : Promise.resolve({ data: [] }),
  ]);
  const rows = list.data ?? [];
  const missing = list.error && /relation|schema/i.test(list.error.message);

  return (
    <main className="report">
      <h1>📣 Complaints</h1>
      <p className="small muted">Everyone has the right to raise a concern without fear of reprisal. Log every complaint the same day. People can also complain directly to CLBC, MCFD, the Representative for Children and Youth or the Ombudsperson — tell them so.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {(sp.error || (list.error && !missing)) && <p className="message error">{plainError(sp.error ?? list.error.message)}</p>}
      {missing && <p className="message">The complaints register is not installed yet (Phase 2 SQL).</p>}

      <form action={logComplaint} className="card no-print">
        <h2>Log a complaint</h2>
        <div className="row">
          <label>How it came in<select name="channel" defaultValue="In person">{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>From (person, family member, representative…)<input name="from_who" maxLength={200} /></label>
          <label>About the person we support (optional)<select name="resident_id" defaultValue=""><option value="">—</option>{(residents ?? []).map((r) => <option key={r.id} value={r.id}>{r.preferred_name || r.first_name} {r.last_name ?? ''}</option>)}</select></label>
        </div>
        <label>What is the complaint? (their words where you can)<textarea name="summary" rows={3} maxLength={4000} required /></label>
        <label className="inline"><input type="checkbox" name="told_can_go_to_funder" /> I told them they can also complain directly to CLBC / MCFD / RCY / the Ombudsperson</label>
        <button>Log complaint</button>
      </form>

      {canManage && !missing && (<>
        <p className="small no-print">{open ? <><strong>Open</strong> · <Link href="/complaints?show=all">All</Link></> : <><Link href="/complaints">Open</Link> · <strong>All</strong></>}</p>
        {!rows.length ? <p className="card muted small">No {open ? 'open ' : ''}complaints.</p> : rows.map((c) => (
          <section key={c.id} className={`card qa-std qa-std-${colour(c.step)}`}>
            <div className="title-row">
              <strong>{c.complaint_no} · {c.step}</strong>
              <span className="small muted">{fmtDate(c.received_at.slice(0, 10))} · {c.channel ?? '—'}{c.from_who ? ` · from ${c.from_who}` : ''}{c.resident ? ` · about ${c.resident.preferred_name || c.resident.first_name}` : ''}{c.home?.name ? ` · ${c.home.name}` : ''} · logged by {c.receiver?.full_name ?? '—'}</span>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{c.summary}</p>
            <p className="small muted">Acknowledged: {c.acknowledged_at ? fmtDate(c.acknowledged_at.slice(0, 10)) : 'not yet'} · Closed: {c.resolved_at ? fmtDate(c.resolved_at.slice(0, 10)) : 'open'}{c.satisfied != null ? ` · Satisfied: ${c.satisfied ? 'yes' : 'no'}` : ''}</p>
            <form action={updateComplaint} className="qa-std-form no-print">
              <input type="hidden" name="id" value={c.id} />
              <div className="row">
                <label>Step<select name="step" defaultValue={c.step}>{STEPS.map((s) => <option key={s}>{s}</option>)}</select></label>
                <label>Satisfied with the outcome?<select name="satisfied" defaultValue={c.satisfied == null ? '' : c.satisfied ? 'yes' : 'no'}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select></label>
                <label className="inline"><input type="checkbox" name="told_can_go_to_funder" defaultChecked={c.told_can_go_to_funder} /> Told about CLBC / MCFD / RCY / Ombudsperson</label>
              </div>
              <label>What we did / outcome<textarea name="outcome" rows={2} maxLength={4000} defaultValue={c.outcome ?? ''} /></label>
              <button>Save</button>
            </form>
          </section>
        ))}
      </>)}
    </main>
  );
}
