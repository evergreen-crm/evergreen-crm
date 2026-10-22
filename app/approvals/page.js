// 🙋 Approvals and 🆘 emergencies — for the Program Coordinator (their house) and Program Managers and above.
// Staff see their own requests here too.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDateTime, TZ } from '@/lib/options';
import { plainError } from '@/lib/plain';
import { fmtDist } from '@/lib/getLocation';
import NotReady from '@/app/components/NotReady';
import { decideRequest, resolveAlert } from './actions';

const ago = (ts) => { const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDateTime(ts); };
const map = (r) => (r.lat != null ? <a href={`https://maps.google.com/?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer">map</a> : null);

export default async function Approvals({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lead = levelOf(profile) >= 2;
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const [reqs, alerts, outs] = await Promise.all([
    supabase.from('shift_permission_requests').select('*, profiles:profile_id(full_name), homes(name), decider:decided_by(full_name)').gte('created_at', since).order('created_at', { ascending: false }),
    supabase.from('emergency_alerts').select('*, profiles:profile_id(full_name), homes(name), resolver:resolved_by(full_name)').gte('created_at', since).order('created_at', { ascending: false }),
    supabase.from('time_entries').select('id, clock_in, clock_out, checkout, checkout_ok, profiles:profile_id(full_name), homes(name)').not('checkout', 'is', null).gte('clock_out', since).neq('profile_id', user.id).order('clock_out', { ascending: false }).limit(40),
  ]);
  if (reqs.error && /does not exist|schema cache/i.test(reqs.error.message)) return <main><h1>Approvals</h1><NotReady what="Safe clock in and out" file="safe-shifts.sql" /></main>;
  const all = reqs.data ?? [];
  const pending = all.filter((r) => r.status === 'Pending' && r.profile_id !== user.id);
  const mine = all.filter((r) => r.profile_id === user.id);
  const decided = all.filter((r) => r.status !== 'Pending' && r.profile_id !== user.id).slice(0, 20);
  const openAlerts = (alerts.data ?? []).filter((a) => !a.resolved_at);
  const closedAlerts = (alerts.data ?? []).filter((a) => a.resolved_at).slice(0, 10);

  return (
    <main>
      <div className="div-banner">
        <span className="div-icon">🙋</span>
        <div><h1>Approvals and emergencies</h1><p>{lead ? 'Requests to clock in or out away from the house or with things unfinished, and 🆘 alerts from staff.' : 'Your requests to clock in or out, and their answers.'}</p></div>
      </div>
      {sp?.ok && <p className="message ok">{sp.ok}</p>}
      {sp?.error && <p className="message error">{plainError(sp.error)}</p>}

      {(lead || openAlerts.length > 0) && (
        <section className={`card${openAlerts.length ? ' rh-urgent' : ''}`} id="emergencies">
          <h2 style={{ marginTop: 0 }}>🆘 Emergencies {openAlerts.length > 0 && <span className="badge bad">{openAlerts.length} open</span>}</h2>
          {!openAlerts.length && <p className="muted">No open emergencies. ✓</p>}
          {openAlerts.map((a) => (
            <div key={a.id} className="sos-row">
              <p style={{ margin: 0 }}><strong>{a.kind}</strong> · {a.homes?.name ?? 'No house'} · {a.profiles?.full_name} · {ago(a.created_at)} {map(a)}{a.distance_m != null && <span className="muted small"> ({fmtDist(a.distance_m)} from the house)</span>}</p>
              {a.note && <p className="small" style={{ margin: '4px 0' }}>“{a.note}”</p>}
              <form action={resolveAlert} className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                <input type="hidden" name="id" value={a.id} />
                <label>What was done<input name="note" placeholder="e.g. Youth found at friend’s, home 10:20 pm" /></label>
                <button>✓ Mark handled</button>
              </form>
            </div>
          ))}
          {closedAlerts.length > 0 && <details><summary className="small">Handled in the last 3 days ({closedAlerts.length})</summary>
            <ul className="list compact">{closedAlerts.map((a) => <li key={a.id}><span>{a.kind} · {a.homes?.name} · {a.profiles?.full_name} · {fmtDateTime(a.created_at)}</span><span className="small muted">✓ {a.resolver?.full_name ?? ''}{a.resolved_note ? ` — ${a.resolved_note}` : ''}</span></li>)}</ul>
          </details>}
        </section>
      )}

      {lead && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Waiting for your answer {pending.length > 0 && <span className="badge warn">{pending.length}</span>}</h2>
          {!pending.length && <p className="muted">Nothing waiting. ✓</p>}
          {pending.map((r) => (
            <div key={r.id} className="req-row">
              <p style={{ margin: 0 }}><strong>{r.profiles?.full_name}</strong> asks to <strong>{r.kind.toLowerCase()}</strong> · {r.homes?.name ?? ''} · {ago(r.created_at)} {map(r)}</p>
              {r.reasons?.length > 0 && <p className="small muted" style={{ margin: '2px 0' }}>{r.reasons.join(' · ')}</p>}
              <p className="small" style={{ margin: '2px 0 6px' }}>“{r.note}”</p>
              <form action={decideRequest} className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                <input type="hidden" name="id" value={r.id} />
                <label>Message (optional)<input name="note" placeholder="e.g. OK — call me when you’re home" /></label>
                <button name="decision" value="approve">✅ Approve</button>
                <button name="decision" value="decline" className="secondary">⛔ Decline</button>
              </form>
            </div>
          ))}
        </section>
      )}

      {mine.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>My requests</h2>
          <ul className="list compact">{mine.map((r) => <li key={r.id}><span>{r.kind} · {fmtDateTime(r.created_at)} · “{r.note}”</span><span className={`badge ${r.status === 'Declined' ? 'bad' : r.status === 'Pending' ? 'warn' : ''}`}>{r.status === 'Used' ? '✓ Used' : r.status}{r.decider ? ` · ${r.decider.full_name}` : ''}</span></li>)}</ul>
          <p className="small"><Link href="/id#checkin">Go to clock in / out →</Link></p>
        </section>
      )}

      {lead && decided.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Decided — last 3 days</h2>
          <ul className="list compact">{decided.map((r) => <li key={r.id}><span>{r.profiles?.full_name} · {r.kind} · {r.homes?.name} · “{r.note}”</span><span className={`badge ${r.status === 'Declined' ? 'bad' : ''}`}>{r.status === 'Used' ? 'Approved ✓' : r.status} · {r.decider?.full_name ?? ''}</span></li>)}</ul>
        </section>
      )}

      {(outs.data ?? []).length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>🛡 Check-outs — last 3 days</h2>
          <table>
            <thead><tr><th>Staff</th><th>House</th><th>Left</th><th>Safe check-out</th><th>Handover to</th><th>Hurt / close call</th></tr></thead>
            <tbody>{outs.data.map((t) => (
              <tr key={t.id}>
                <td>{t.profiles?.full_name}</td><td>{t.homes?.name}</td>
                <td>{new Date(t.clock_out).toLocaleString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                <td>{t.checkout_ok ? <span className="badge">✓ All done</span> : <span className="badge warn">⚠ With OK: {(t.checkout?.missing ?? []).join(', ')}</span>}</td>
                <td className="small">{t.checkout?.handover_to || (t.checkout?.handover_on_call ? `On-call: ${t.checkout.handover_on_call}` : '—')}</td>
                <td>{t.checkout?.hurt === 'yes' ? <span className="badge bad">Yes — {t.checkout.hurt_details}</span> : 'No'}</td>
              </tr>))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
