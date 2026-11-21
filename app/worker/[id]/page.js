// Social worker view of one youth (Nov 21, 2026): read-only, only what worker_file() returns, every view logged.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtTime, addDaysISO, todayISO } from '@/lib/options';
import { sendWorkerMessage } from '@/app/residents/worker-actions';

export const dynamic = 'force-dynamic';
const TABS = [
  ['overview', 'Overview'], ['week', 'Weekly summary'], ['incidents', 'Incidents'], ['appointments', 'Appointments'],
  ['plan', 'Plan & goals'], ['documents', 'Documents to sign'], ['messages', 'Messages'],
];
const age = (d) => { if (!d) return null; const b = new Date(d + 'T12:00:00Z'); const n = new Date(); let a = n.getUTCFullYear() - b.getUTCFullYear(); if (n < new Date(Date.UTC(n.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()))) a--; return a; };
const day = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const list = (a) => (a ?? []).filter(Boolean).join(', ') || '—';

export default async function WorkerYouth({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase, user, profile } = await requireUser(['family']);
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab : 'overview';
  const week = /^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? '') ? sp.week : null;
  const { data: f, error } = await supabase.rpc('worker_file', { p_resident: id, p_tab: tab === 'messages' ? 'overview' : tab, p_week: week });
  if (error || !f) redirect('/?oops=' + encodeURIComponent(error?.message?.includes('access') ? error.message : 'You don’t have access to that file.'));
  const y = f.youth;
  const name = y.preferred_name || y.name;

  let thread = [];
  if (tab === 'messages') {
    const { data } = await supabase.from('worker_messages').select('*, sender:sender_id(full_name)').eq('resident_id', id).eq('worker_id', user.id).order('created_at').limit(500);
    thread = data ?? [];
    const unread = thread.filter((m) => m.sender_id !== user.id && !m.read_at);
    if (unread.length) await supabase.from('worker_messages').update({ read_at: new Date().toISOString() }).in('id', unread.map((m) => m.id));
  }

  const wk = f.week_start;
  return (
    <main>
      <p className="small"><Link href="/">← Your youth</Link></p>
      <h1 style={{ marginBottom: 4 }}>{name}{y.preferred_name ? <span className="muted small"> ({y.name})</span> : null}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{f.house?.name} · {y.care_type ?? ''}{y.date_of_birth ? ` · age ${age(y.date_of_birth)}` : ''}{y.admission_date ? ` · at Evergreen since ${fmtDate(y.admission_date)}` : ''}{y.file_number ? ` · file ${y.file_number}` : ''}</p>
      <p className="small" style={{ margin: '0 0 8px' }}><span className="badge">Read-only</span> You are their {f.access?.worker_role?.replace(/^Social/, 'social').replace(/^Guardianship/, 'guardianship').replace(/^Resource/, 'resource')} ({f.access?.org}). Access until {fmtDate(f.access?.expires_on)}. Every view is recorded.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      <nav className="tabs-bar no-print">{TABS.map(([k, l]) => <Link key={k} href={`/worker/${id}?tab=${k}`} className={k === tab ? 'on' : ''}>{l}</Link>)}</nav>

      {tab === 'overview' && (
        <>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Contact the house</h2>
            <p>{f.house?.name}{f.house?.phone ? <> · <a href={`tel:${f.house.phone}`}>{f.house.phone}</a></> : ''}{f.house?.on_call_phone ? <> · on-call <a href={`tel:${f.house.on_call_phone}`}>{f.house.on_call_phone}</a></> : ''}</p>
            <ul className="small">{(f.leaders ?? []).map((l) => <li key={l.email ?? l.name}>{l.name} · {l.role}{l.email ? <> · <a href={`mailto:${l.email}`}>{l.email}</a></> : ''}{l.phone ? ` · ${l.phone}` : ''}</li>)}</ul>
            <p className="small"><Link href={`/worker/${id}?tab=messages`}>💬 Send a message to the house team →</Link></p>
          </section>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>This week</h2>
            {(f.week ?? []).length === 0 ? <p className="muted">No signed daily notes yet this week.</p> : <p className="small">{f.week.length} day{f.week.length > 1 ? 's' : ''} with daily notes. <Link href={`/worker/${id}?tab=week`}>See the weekly summary →</Link></p>}
            <h3>Recent incidents (reviewed)</h3>
            {(f.incidents ?? []).length === 0 ? <p className="muted small">None in the last 12 months.</p> : <ul className="small">{f.incidents.slice(0, 3).map((i, n) => <li key={n}>{fmtDate(i.occurred_on)} · {i.type}{i.critical ? ' · critical' : ''}</li>)}</ul>}
            <h3>Coming up</h3>
            {(f.appointments ?? []).filter((a) => a.date >= todayISO()).length === 0 ? <p className="muted small">No appointments in the next 60 days.</p> : <ul className="small">{f.appointments.filter((a) => a.date >= todayISO()).slice(0, 5).map((a, n) => <li key={n}>{day(a.date)}{a.start ? ` ${fmtTime(a.start)}` : ''} · {a.title}{a.location ? ` · ${a.location}` : ''}</li>)}</ul>}
            {(f.documents ?? []).some((d) => !['Signed', 'Declined'].includes(d.status)) && <p className="message small">✍️ You have a document to sign. <Link href={`/worker/${id}?tab=documents`}>Open →</Link></p>}
          </section>
        </>
      )}

      {tab === 'week' && (
        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Week of {fmtDate(wk)}</h2>
            <span className="small"><Link href={`/worker/${id}?tab=week&week=${addDaysISO(wk, -7)}`}>← Previous week</Link>{wk < addDaysISO(todayISO(), -6) && <> · <Link href={`/worker/${id}?tab=week&week=${addDaysISO(wk, 7)}`}>Next week →</Link></>}</span>
          </div>
          <p className="muted small">A summary from the signed daily notes: mood, meals, activities and goals worked on. The full notes stay with the house team; ask them if you need more.</p>
          {(f.week ?? []).length === 0 ? <p className="muted">No signed daily notes this week.</p> : (
            <table><thead><tr><th>Day</th><th>Mood</th><th>Meals</th><th>Activities</th><th>Goals worked on</th><th>Notes</th></tr></thead>
              <tbody>{f.week.map((d) => <tr key={d.date}><td>{day(d.date)}</td><td>{list(d.moods)}</td><td>{list(d.meals)}</td><td>{list(d.activities)}</td><td>{list(d.goals)}</td><td>{d.notes}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'incidents' && (
        <section>
          <p className="muted small">Incidents show here after the Program Manager’s review. Critical incidents are also reported to you by phone and on the official form within 24 hours.</p>
          {(f.incidents ?? []).length === 0 && <p className="card muted">No reviewed incidents in the last 12 months.</p>}
          {(f.incidents ?? []).map((i, n) => (
            <div key={n} className="card">
              <strong>{fmtDate(i.occurred_on)}{i.time ? ` ${fmtTime(i.time)}` : ''} · {i.type}</strong> {i.class && <span className="badge">{i.class}</span>} {i.critical && <span className="badge bad">Critical</span>}
              <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{i.description}</p>
              {i.actions_taken && <p className="small"><strong>What staff did:</strong> {i.actions_taken}</p>}
              <p className="muted small">{i.injuries ? `Injuries: ${i.injuries} · ` : ''}{i.physical_intervention ? 'Physical intervention used · ' : ''}{i.police ? 'Police involved · ' : ''}{i.form_number ? `Form ${i.form_number}${i.form_sent_at ? ` sent ${fmtDateTime(i.form_sent_at)}` : ''} · ` : ''}Reviewed {fmtDateTime(i.reviewed_at)}</p>
            </div>
          ))}
          <h2>Missing episodes (last 12 months)</h2>
          {(f.missing ?? []).length === 0 ? <p className="muted small">None.</p> : <ul className="small">{f.missing.map((m, n) => <li key={n}>{fmtDateTime(m.started_at)} to {m.found_at ? fmtDateTime(m.found_at) : 'not found yet'}{m.found_where ? ` · found ${m.found_where}` : ''}{m.police ? ' · police called' : ''}</li>)}</ul>}
        </section>
      )}

      {tab === 'appointments' && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Appointments (last 30 days and next 60)</h2>
          {(f.appointments ?? []).length === 0 ? <p className="muted">None.</p> : (
            <table><thead><tr><th>Date</th><th>What</th><th>Where</th><th>Status</th></tr></thead>
              <tbody>{f.appointments.map((a, n) => <tr key={n}><td>{day(a.date)}{a.start ? ` ${fmtTime(a.start)}` : ''}</td><td>{a.title}{a.category ? <span className="muted small"> · {a.category}</span> : null}</td><td>{a.location ?? '—'}</td><td>{a.status ?? '—'}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'plan' && (
        <>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Care plan</h2>
            {!f.plan ? <p className="muted">No care plan written yet.</p> : (
              <>
                <p className="muted small">{f.plan.last_review_on ? `Last reviewed ${fmtDate(f.plan.last_review_on)}` : 'Not reviewed yet'}{f.plan.next_review_on ? ` · next review ${fmtDate(f.plan.next_review_on)}` : ''}</p>
                {f.plan.what_matters && <><h3>What matters to {name}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{f.plan.what_matters}</p></>}
                {f.plan.strengths && <><h3>Strengths</h3><p style={{ whiteSpace: 'pre-wrap' }}>{f.plan.strengths}</p></>}
                {f.plan.how_to_support && <><h3>How we support {name}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{f.plan.how_to_support}</p></>}
              </>
            )}
          </section>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Goals</h2>
            {(f.goals ?? []).length === 0 ? <p className="muted">No goals yet.</p> : <ul>{f.goals.map((g, n) => <li key={n}><strong>{g.title}</strong>{g.domain ? ` · ${g.domain}` : ''} · {g.status ?? 'Active'}{g.steps ? ` · ${g.steps_done} of ${g.steps} steps done` : ''}{g.target_date ? ` · target ${fmtDate(g.target_date)}` : ''}</li>)}</ul>}
          </section>
        </>
      )}

      {tab === 'documents' && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Documents to sign</h2>
          {(f.documents ?? []).length === 0 ? <p className="muted">Nothing has been sent to you to sign.</p> : (
            <ul>{f.documents.map((d, n) => <li key={n}><strong>{d.title}</strong> · {d.status}{d.due ? ` · due ${fmtDate(d.due)}` : ''}{d.signed_at ? ` · signed ${fmtDateTime(d.signed_at)}` : ''}
              {!['Signed', 'Declined'].includes(d.status) && (d.mine ? <> · <Link href={`/sign/${d.request_id}`}>Open and sign →</Link></> : d.token ? <> · <Link href={`/f/sign/${d.token}`}>Open and sign →</Link></> : null)}</li>)}</ul>
          )}
        </section>
      )}

      {tab === 'messages' && (
        <section>
          <p className="muted small">Messages with {name}’s house team (Program Coordinator and Program Manager). This is part of the permanent record. For anything urgent, phone the house{f.house?.phone ? ` at ${f.house.phone}` : ''}.</p>
          <div className="chat">
            {thread.length === 0 && <p className="muted">No messages yet.</p>}
            {thread.map((m) => (
              <div key={m.id} className={`bubble ${m.sender_id === user.id ? 'mine' : ''}`}>
                <div className="meta">{m.sender_id === user.id ? 'You' : `${m.sender?.full_name ?? 'Evergreen staff'} (Evergreen)`} · {fmtDateTime(m.created_at)}{m.sender_id === user.id && m.read_at ? ' · Read' : ''}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
              </div>
            ))}
          </div>
          <form action={sendWorkerMessage} id="end">
            <input type="hidden" name="resident_id" value={id} />
            <textarea name="body" rows={3} maxLength={4000} required placeholder="Write to the house team…" />
            <button>Send</button>
          </form>
        </section>
      )}
    </main>
  );
}
