// "Social worker" tab (Nov 21, 2026): who has the read-only social worker view of this youth, add / renew / end it,
// and the message thread with each worker. Shown to the house's PC, managers and the Administrator.
import { fmtDate, fmtDateTime, addDaysISO, todayISO } from '@/lib/options';
import { addWorker, renewWorker, endWorker, sendWorkerMessage } from '@/app/residents/worker-actions';

const ROLES = ['Social worker', 'Guardianship worker', 'Resource worker', 'Youth worker (MCFD)', 'CLBC facilitator', 'CLBC analyst', 'Other'];
const ORGS = ['MCFD', 'CLBC', 'Delegated Aboriginal Agency', 'Other'];

export default async function WorkerTab({ supabase, resident, user, msg }) {
  const [{ data: rows, error }, { data: msgs }] = await Promise.all([
    supabase.from('worker_access').select('*, person:profile_id(full_name, email, phone), granter:granted_by(full_name), ender:ended_by(full_name)')
      .eq('resident_id', resident.id).order('granted_at', { ascending: false }),
    supabase.from('worker_messages').select('*, sender:sender_id(full_name)').eq('resident_id', resident.id).order('created_at').limit(500),
  ]);
  if (error) return <p className="message">The social worker view isn’t set up on this portal yet (supabase/social-worker-view.sql).</p>;
  const open = (rows ?? []).filter((r) => !r.ended_at);
  const ended = (rows ?? []).filter((r) => r.ended_at);
  const today = todayISO();
  // Opening the tab marks the workers' messages as read.
  const unread = (msgs ?? []).filter((m) => m.sender_id === m.worker_id && !m.read_at);
  if (unread.length) await supabase.from('worker_messages').update({ read_at: new Date().toISOString() }).in('id', unread.map((m) => m.id));

  return (
    <section>
      {msg?.ok && <p className="message ok">{msg.ok}</p>}
      <p className="muted small">A social worker (MCFD, CLBC or an Aboriginal agency) can sign in and see a read-only view of this youth only: care plan and goals, appointments, a weekly summary of daily notes, incidents after the Program Manager’s review, missing episodes, documents to sign, and messages with the house team. They never see medications, staff files, family messages or other youth. Every view shows on “Who opened”.</p>

      {open.length === 0 && <p className="card muted">No social worker has access right now.</p>}
      {open.map((r) => {
        const expired = r.expires_on < today;
        const thread = (msgs ?? []).filter((m) => m.worker_id === r.profile_id);
        return (
          <div key={r.id} id={`w-${r.profile_id}`} className="card">
            <h3 style={{ marginTop: 0 }}>{r.person?.full_name} <span className="muted small">· {r.worker_role}, {r.org}</span></h3>
            <p className="small" style={{ margin: '4px 0' }}>{r.person?.email}{r.person?.phone ? ` · ${r.person.phone}` : ''}</p>
            <p className="small" style={{ margin: '4px 0' }}>
              {expired ? <span className="badge bad">Ended {fmtDate(r.expires_on)} (date passed)</span> : <span className="badge">Access until {fmtDate(r.expires_on)}</span>}
              {' '}Given by {r.granter?.full_name ?? '—'} on {fmtDateTime(r.granted_at)}{r.renewed_at ? ` · renewed ${fmtDateTime(r.renewed_at)}` : ''}
            </p>
            <div className="row no-print" style={{ gap: 8, alignItems: 'end' }}>
              <form action={renewWorker}><input type="hidden" name="resident_id" value={resident.id} /><input type="hidden" name="id" value={r.id} /><button className="secondary small">↻ Renew 6 months</button></form>
              <form action={endWorker} className="row" style={{ gap: 6, alignItems: 'center' }}>
                <input type="hidden" name="resident_id" value={resident.id} /><input type="hidden" name="id" value={r.id} />
                <input name="reason" placeholder="Why (e.g. case transferred)" maxLength={300} style={{ maxWidth: 220 }} />
                <label className="check small"><input type="checkbox" name="confirm" /> Confirm</label>
                <button className="danger small">End access</button>
              </form>
            </div>
            <h4>Messages with {r.person?.full_name?.split(' ')[0]}</h4>
            <div className="chat">
              {thread.length === 0 && <p className="muted small">No messages yet.</p>}
              {thread.map((m) => (
                <div key={m.id} className={`bubble ${m.sender_id === user.id ? 'mine' : ''}`}>
                  <div className="meta">{m.sender_id === m.worker_id ? `${r.person?.full_name} (social worker)` : m.sender?.full_name} · {fmtDateTime(m.created_at)}{m.sender_id !== m.worker_id && m.read_at ? ' · Read' : ''}</div>
                  <div>{m.body}</div>
                </div>
              ))}
            </div>
            <form action={sendWorkerMessage} className="no-print">
              <input type="hidden" name="resident_id" value={resident.id} /><input type="hidden" name="worker_id" value={r.profile_id} />
              <textarea name="body" rows={2} maxLength={4000} placeholder={`Reply to ${r.person?.full_name}… (part of the permanent record)`} />
              <button className="small">Send</button>
            </form>
          </div>
        );
      })}

      <details className="card no-print" open={open.length === 0 || undefined}>
        <summary><strong>➕ Give a social worker access</strong></summary>
        <form action={addWorker}>
          <input type="hidden" name="resident_id" value={resident.id} />
          <div className="row">
            <label>Full name *<input name="full_name" required maxLength={120} /></label>
            <label>Work email *<input name="email" type="email" required maxLength={200} placeholder="name@gov.bc.ca" /></label>
            <label>Phone<input name="phone" maxLength={40} /></label>
          </div>
          <div className="row">
            <label>Role<select name="worker_role" defaultValue="Social worker">{ROLES.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Organization<select name="org" defaultValue={resident.care_type === 'Adult' ? 'CLBC' : 'MCFD'}>{ORGS.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Access until *<input type="date" name="expires_on" required defaultValue={addDaysISO(today, 183)} min={today} max={addDaysISO(today, 366)} /></label>
          </div>
          <label className="check"><input type="checkbox" name="confirm" /> I confirm this person is {resident.preferred_name || resident.first_name}’s current worker (check their name against the referral or placement agreement).</label>
          <button>Give read-only access</button>
          <p className="muted small">They sign in at the portal with this email (a one-time code each time, no password). Access ends by itself on the end date; you get a reminder 14 days before.</p>
        </form>
      </details>

      {ended.length > 0 && (
        <details className="card">
          <summary className="small">Past social workers ({ended.length})</summary>
          <ul className="small">{ended.map((r) => <li key={r.id}>{r.person?.full_name} · {r.worker_role}, {r.org} · {fmtDate(r.granted_at.slice(0, 10))} to {fmtDate(r.ended_at.slice(0, 10))}{r.ender?.full_name ? ` (ended by ${r.ender.full_name}` : ''}{r.end_reason ? `: ${r.end_reason}` : ''}{r.ender?.full_name ? ')' : ''}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
