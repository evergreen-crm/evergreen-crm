// Portal home, per role: each person first sees only the work for their level.
//  Level 1-2 with a house: My shift (clock in, 4 big buttons, my youth today, handover, due soon).
//  Level 2 adds "Waiting for me" for their house. Level 3 adds Urgent, Approvals and My houses.
//  Level 4+ adds "Approvals waiting for me" (launch plan sign-offs, promotions).
// Everything else stays in the ☰ Menu and in the portal areas below.
import Link from 'next/link';
import { levelOf, groupOf } from '@/lib/levels';
import { fmtDate, fmtTime, todayISO, addDaysISO } from '@/lib/options';
import { getMyTodos } from '@/lib/todos';

const rows = (res) => (res && !res.error ? res.data ?? [] : []);
const cnt = (res) => (res && !res.error ? res.count ?? 0 : 0);
const name = (r) => r.preferred_name || r.first_name;

function Big({ href, icon, label, hint }) {
  return (
    <Link href={href} className="rh-big">
      <span className="rh-big-icon">{icon}</span>
      <strong>{label}</strong>
      {hint && <span className="small muted">{hint}</span>}
    </Link>
  );
}

function Line({ href, n, label, bad }) {
  return (
    <li><Link href={href}><span>{label}</span><span className={`badge ${n ? (bad ? 'bad' : 'warn') : ''}`}>{n || '✓'}</span></Link></li>
  );
}

export default async function RoleHome({ supabase, profile, userId }) {
  const lvl = levelOf(profile);
  const today = todayISO();
  const in7 = addDaysISO(today, 7);
  const homeId = profile.home_id;
  const worker = lvl <= 2 && homeId && !groupOf(profile);

  // Everyone's own to-do list (the same list as /todo and the ✅ counter).
  const todos = await getMyTodos(supabase, profile).catch(() => []);

  // ---------- Level 1-2: my shift ----------
  let shift = null;
  if (worker) {
    const [home, open, youth, notes, appts, handover] = await Promise.all([
      supabase.from('homes').select('id, name').eq('id', homeId).maybeSingle(),
      supabase.from('time_entries').select('id, clock_in').eq('profile_id', userId).is('clock_out', null).maybeSingle(),
      supabase.from('residents').select('id, first_name, preferred_name, last_name, allergies, status').eq('home_id', homeId).neq('status', 'discharged').order('first_name'),
      supabase.from('shift_notes').select('resident_id, author_id, signed_at').eq('note_date', today),
      supabase.from('appointments').select('id, title, start_time, residents(first_name, preferred_name)').eq('home_id', homeId).eq('appt_date', today).neq('status', 'Cancelled').order('start_time'),
      supabase.from('entries').select('id, entry_date, entry_time, data, author:created_by(full_name)').eq('home_id', homeId).eq('kind', 'commbook').order('created_at', { ascending: false }).limit(3),
    ]);
    const noteBy = {};
    for (const n of rows(notes)) (noteBy[n.resident_id] ??= []).push(n);
    // Same list as /todo, so the numbers match everywhere.
    const due = todos.slice(0, 3).map((t) => ({ key: t.key, href: t.href, text: t.title, when: t.bucket === 'today' ? 'now' : t.due, bad: t.bucket === 'overdue' }));
    const dueTotal = todos.length;
    shift = { home: home.data, open: open.data, youth: rows(youth), noteBy, appts: rows(appts), handover: rows(handover), due, dueTotal };
  }

  // ---------- Level 2: waiting for me (my house) ----------
  let pc = null;
  if (lvl === 2 && homeId && !groupOf(profile)) {
    const [drafts, incidents, gaps] = await Promise.all([
      supabase.from('shift_notes').select('id, residents!inner(home_id)', { count: 'exact', head: true }).is('signed_at', null).lt('note_date', today).eq('residents.home_id', homeId),
      supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('home_id', homeId).eq('status', 'Open'),
      supabase.from('shifts').select('id', { count: 'exact', head: true }).eq('home_id', homeId).is('profile_id', null).gte('shift_date', today).lte('shift_date', in7),
    ]);
    pc = { drafts: cnt(drafts), incidents: cnt(incidents), gaps: cnt(gaps) };
  }

  // ---------- Level 3+: urgent, approvals, my houses ----------
  let pm = null;
  if (lvl >= 3) {
    const since = new Date(Date.now() - 864e5).toISOString();
    const [noNotice, recent, timesheets, reviews, homes, openShifts, openInc] = await Promise.all([
      supabase.from('incidents').select('id, occurred_on, incident_type, home_id, homes(name)').eq('is_critical', true).is('verbal_report_at', null).eq('status', 'Open').order('occurred_on').limit(5),
      supabase.from('incidents').select('id', { count: 'exact', head: true }).gte('created_at', since),
      supabase.from('time_entries').select('id', { count: 'exact', head: true }).not('clock_out', 'is', null).is('approved_by', null),
      supabase.from('probation_due_list').select('review_id', { count: 'exact', head: true }).in('review_status', ['Overdue', 'Due this week']).in('probation_status', ['On probation', 'Extended']),
      supabase.from('homes').select('id, name').order('name'),
      supabase.from('shifts').select('home_id').is('profile_id', null).gte('shift_date', today).lte('shift_date', in7),
      supabase.from('incidents').select('home_id').eq('status', 'Open'),
    ]);
    const tally = (list) => list.reduce((m, x) => ((m[x.home_id] = (m[x.home_id] ?? 0) + 1), m), {});
    pm = { noNotice: rows(noNotice), recent: cnt(recent), timesheets: cnt(timesheets), reviews: cnt(reviews), homes: rows(homes), gaps: tally(rows(openShifts)), inc: tally(rows(openInc)) };
  }

  // ---------- Level 4+: executive approvals ----------
  let ex = null;
  if (lvl >= 4) {
    const [signoffs, promos] = await Promise.all([
      supabase.from('launch_checklist_due').select('id, plan_id, item, min_level').is('done_on', null).eq('not_applicable', false).gte('min_level', 5).lte('min_level', lvl).limit(6),
      supabase.from('staff_promotions').select('id', { count: 'exact', head: true }).in('status', ['Requested', 'Recommended', 'Board review']),
    ]);
    ex = { signoffs: rows(signoffs), promos: cnt(promos) };
  }

  if (!shift && !pc && !pm && !ex && !todos.length) return null;
  const overdue = todos.filter((t) => t.bucket === 'overdue').length;

  return (
    <section className="rh no-print">
      {shift && (
        <div className="card rh-shift">
          <div className="rh-head">
            <div>
              <h2 style={{ margin: 0 }}>My shift{shift.home ? ` · ${shift.home.name}` : ''}</h2>
              <p className="muted small" style={{ margin: 0 }}>{fmtDate(today)}{shift.open ? ` · on shift since ${new Date(shift.open.clock_in).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Vancouver' })}` : ''}</p>
            </div>
            <Link href="/id#checkin" className={`button ${shift.open ? 'secondary' : ''} rh-clock`}>{shift.open ? '🪪 Check in / Clock out' : '🪪 Clock in'}</Link>
          </div>

          <div className="rh-bigs">
            <Big href="/checklist" icon="📋" label="Shift checklist" hint="Tick & sign every shift" />
            <Big href="/notes" icon="📝" label="Daily notes" hint="Everyone, one screen" />
            <Big href="#my-youth" icon="💊" label="Medication" hint="Record each dose" />
            <Big href="#my-youth" icon="⚠️" label="Report an incident" hint="Tell on-call first" />
            <Big href={shift.home ? `/homes/${shift.home.id}?tab=commbook` : '/homes'} icon="📒" label="Shift log" hint="Handover & comm book" />
          </div>

          <h3 id="my-youth">My youth today</h3>
          {!shift.youth.length && <p className="muted small">No one is living at your house right now.</p>}
          <ul className="rh-youth">
            {shift.youth.map((r) => {
              const n = shift.noteBy[r.id] ?? [];
              const mine = n.some((x) => x.author_id === userId);
              return (
                <li key={r.id}>
                  <Link href={`/residents/${r.id}`} className="rh-who"><strong>{name(r)} {r.last_name?.[0] ? `${r.last_name[0]}.` : ''}</strong>
                    {r.allergies && <span className="badge bad" title={r.allergies}>Allergy</span>}
                    <span className={`small ${mine ? '' : 'muted'}`}>{mine ? '✓ your note done' : n.length ? `${n.length} note${n.length > 1 ? 's' : ''} today` : 'no note yet today'}</span>
                  </Link>
                  <span className="rh-acts">
                    <Link href={`/notes#r-${r.id}`} className="chip">📝 Note</Link>
                    <Link href={`/residents/${r.id}?tab=mar`} className="chip">💊 Meds</Link>
                    <Link href={`/residents/${r.id}?tab=incidents&new=1`} className="chip">⚠️ Incident</Link>
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="grid2">
            <div>
              <h3>Today at my house</h3>
              {!shift.appts.length && <p className="muted small">No appointments today.</p>}
              <ul className="agenda">{shift.appts.map((a) => <li key={a.id}><span className="when">{a.start_time ? fmtTime(a.start_time) : 'Today'}</span><span>{a.title}{a.residents ? ` · ${name(a.residents)}` : ''}</span></li>)}</ul>
              {shift.handover.length > 0 && <>
                <h4 style={{ margin: '10px 0 4px' }}>Latest handover notes</h4>
                <ul className="list compact">{shift.handover.map((h) => <li key={h.id}><span className="small">{(h.data?.text ?? h.data?.note ?? h.data?.message ?? '').toString().slice(0, 140) || 'Communication book entry'}</span><span className="muted small">{h.author?.full_name ?? ''} · {fmtDate(h.entry_date)}</span></li>)}</ul>
              </>}
            </div>
            <div>
              <h3>Due soon for me</h3>
              {!shift.due.length && <p className="muted small">Nothing due. 🎉</p>}
              <ul className="list compact">{shift.due.map((d) => <li key={d.key}><Link href={d.href}>{d.text}</Link><span className={`badge ${d.bad ? 'bad' : 'warn'}`}>{d.when === 'now' ? 'Now' : d.when ? fmtDate(d.when) : 'To do'}</span></li>)}</ul>
              <p className="small"><Link href="/todo">✅ All my to-do{shift.dueTotal ? ` (${shift.dueTotal})` : ''} →</Link> · <Link href="/academy/plan">My training plan →</Link></p>
            </div>
          </div>
        </div>
      )}

      {!shift && todos.length > 0 && (
        <div className={`card ${overdue ? 'rh-urgent' : ''}`}>
          <h2 style={{ marginTop: 0 }}>✅ My to-do <span className="muted small">— {todos.length} task{todos.length === 1 ? '' : 's'}{overdue ? `, ${overdue} overdue` : ''}</span></h2>
          <ul className="list compact">{todos.slice(0, 5).map((t) => <li key={t.key}><Link href={t.href}>{t.icon} {t.title}</Link><span className={`badge ${t.bucket === 'overdue' ? 'bad' : 'warn'}`}>{t.bucket === 'overdue' ? 'Overdue' : t.bucket === 'today' ? 'Today' : t.due ? fmtDate(t.due) : 'This week'}</span></li>)}</ul>
          <p className="small"><Link href="/todo">See all →</Link>{levelOf(profile) >= 3 && <> · <Link href="/todo?view=team">Who on my team is behind →</Link></>}</p>
        </div>
      )}

      {pc && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Waiting for me</h2>
          <ul className="list rh-lines">
            <Line href={shift?.home ? `/homes/${shift.home.id}?tab=residents` : '/homes'} n={pc.drafts} label="Daily notes from past shifts still not signed" />
            <Line href={shift?.home ? `/homes/${shift.home.id}?tab=dashboard` : '/homes'} n={pc.incidents} label="Open incident reports to review" bad />
            <Line href="/schedule" n={pc.gaps} label="Open shifts in the next 7 days" bad />
          </ul>
          <p className="small"><Link href="/badges">My house’s badges →</Link> · <Link href="/probation">Probation reviews →</Link></p>
        </div>
      )}

      {pm && (
        <div className="grid2">
          <div className={`card ${pm.noNotice.length ? 'rh-urgent' : ''}`}>
            <h2 style={{ marginTop: 0 }}>🚨 Urgent</h2>
            {pm.noNotice.length ? <>
              <p className="small"><strong>Critical incidents with no MCFD/CLBC notice recorded</strong> — notify within 24 hours (serious ones by phone right away):</p>
              <ul className="list compact">{pm.noNotice.map((i) => <li key={i.id}><span>{i.incident_type} · {i.homes?.name ?? ''}</span><span className="badge bad">{fmtDate(i.occurred_on)}</span></li>)}</ul>
            </> : <p className="muted small">No critical incidents waiting for an MCFD/CLBC notice. ✓</p>}
            <p className="small muted">{pm.recent} incident report{pm.recent === 1 ? '' : 's'} in the last 24 hours.</p>
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Approvals</h2>
            <ul className="list rh-lines">
              <Line href="/timesheet" n={pm.timesheets} label="Timesheets to approve" />
              <Line href="/probation" n={pm.reviews} label="Probation reviews due this week" />
            </ul>
          </div>
        </div>
      )}

      {pm && pm.homes.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>My houses</h2>
          <table>
            <thead><tr><th>House</th><th>Open shifts (7 days)</th><th>Open incidents</th><th></th></tr></thead>
            <tbody>{pm.homes.map((h) => (
              <tr key={h.id}>
                <td><strong>{h.name}</strong></td>
                <td>{pm.gaps[h.id] ? <span className="badge bad">{pm.gaps[h.id]}</span> : <span className="badge">✓ 0</span>}</td>
                <td>{pm.inc[h.id] ? <span className="badge warn">{pm.inc[h.id]}</span> : <span className="badge">✓ 0</span>}</td>
                <td><Link href={`/homes/${h.id}`}>Open →</Link></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}

      {ex && (ex.signoffs.length > 0 || ex.promos > 0) && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>✍️ Approvals waiting for me</h2>
          <ul className="list compact">
            {ex.signoffs.map((s) => <li key={s.id}><Link href={`/launch/${s.plan_id}?tab=checklist&f=todo`}>{s.item}</Link><span className="badge warn">Launch plan</span></li>)}
            {ex.promos > 0 && <li><Link href="/careers#requests">Promotion requests waiting</Link><span className="badge warn">{ex.promos}</span></li>}
          </ul>
        </div>
      )}
    </section>
  );
}
