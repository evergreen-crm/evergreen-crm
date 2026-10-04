// Dashboard: everything that needs attention today, across the houses you can see.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { programsFor, itemState } from '@/lib/requirements';
import { writtenDue, reviewDue } from '@/lib/incidents';
import { certStatus } from '@/lib/hr';
import { ENTRY_TYPES } from '@/lib/entries';
import { todayISO, nowTime, addDaysISO, fmtDate, fmtTime } from '@/lib/options';

const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export default async function Dashboard() {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isMgr = ['admin', 'manager'].includes(profile.role);
  const today = todayISO();
  const now = mins(nowTime());

  const [
    { data: homes }, { data: residents }, { data: reqs }, { data: incidents }, { data: certs },
    { data: meds }, { data: given }, { data: drills }, { data: unread }, { data: pendingTime },
    { data: commbook }, { data: shifts }, { data: appts },
  ] = await Promise.all([
    supabase.from('homes').select('id, name').order('name'),
    supabase.from('residents').select('*').neq('status', 'discharged'),
    supabase.from('resident_requirements').select('*'),
    supabase.from('incidents').select('*, residents(first_name, last_name, funder, care_type)').eq('status', 'Open'),
    isMgr ? supabase.from('certifications').select('*, profiles:profile_id(full_name, active)').lte('expires_on', addDaysISO(today, 30)) : { data: [] },
    supabase.from('medications').select('id, name, times, resident_id').eq('active', true).eq('is_prn', false),
    supabase.from('med_administrations').select('medication_id, scheduled_time').eq('admin_date', today),
    supabase.from('entries').select('home_id, entry_date').eq('kind', 'fire_drill').gte('entry_date', today.slice(0, 7) + '-01'),
    supabase.from('messages').select('resident_id, created_at').eq('sender_role', 'family').is('read_at', null),
    isMgr ? supabase.from('time_entries').select('id').not('clock_out', 'is', null).is('approved_at', null) : { data: [] },
    supabase.from('entries').select('*, author:created_by(full_name), homes(name)').eq('kind', 'commbook').gte('entry_date', addDaysISO(today, -2)).order('created_at', { ascending: false }),
    supabase.from('shifts').select('*, profiles:profile_id(full_name), homes(name)').eq('shift_date', today).order('start_time'),
    supabase.from('appointments').select('*, residents(first_name, last_name), homes(name)').eq('appt_date', today).neq('status', 'Cancelled').order('start_time'),
  ]);

  const rById = Object.fromEntries((residents ?? []).map((r) => [r.id, r]));
  const name = (r) => r ? `${r.preferred_name || r.first_name} ${r.last_name}` : 'Resident';
  const alerts = []; // { level: 'bad'|'warn', text, href }

  // Overdue requirements
  const recs = {};
  for (const x of reqs ?? []) recs[`${x.resident_id}:${x.req_key}`] = x;
  for (const r of residents ?? []) {
    let overdue = 0;
    for (const p of programsFor(r)) for (const s of p.sections) for (const it of s.items) {
      const st = itemState(it, recs[`${r.id}:${it.key}`], r, today);
      if (st.applies && st.flag === 'overdue') overdue++;
    }
    if (overdue) alerts.push({ level: 'bad', text: `${name(r)}: ${overdue} requirement${overdue > 1 ? 's' : ''} overdue`, href: `/residents/${r.id}?tab=requirements` });
  }

  // Open incidents with steps due
  for (const inc of incidents ?? []) {
    const program = programsFor(inc.residents ?? {})[0]?.key ?? 'mcfd';
    const who = name(inc.residents);
    const href = `/residents/${inc.resident_id}?tab=incidents`;
    if (inc.is_critical && !inc.verbal_report_at) alerts.push({ level: 'bad', text: `${who}: critical incident not yet phoned in (${inc.incident_type})`, href });
    if (inc.is_critical && !inc.written_report_sent_on) {
      const due = writtenDue(inc, program);
      alerts.push({ level: due < today ? 'bad' : 'warn', text: `${who}: written incident report ${due < today ? 'OVERDUE' : 'due'} ${fmtDate(due)}`, href });
    }
    if (!inc.internal_review_on && reviewDue(inc) < today) alerts.push({ level: 'warn', text: `${who}: incident review overdue`, href });
  }

  // Medication doses not signed (over 1 hour late)
  const signed = new Set((given ?? []).map((g) => `${g.medication_id}:${g.scheduled_time}`));
  const lateByRes = {};
  for (const m of meds ?? []) for (const t of m.times) {
    if (now - mins(t) > 60 && !signed.has(`${m.id}:${t}`)) lateByRes[m.resident_id] = (lateByRes[m.resident_id] ?? 0) + 1;
  }
  for (const [rid, n] of Object.entries(lateByRes)) alerts.push({ level: 'bad', text: `${name(rById[rid])}: ${n} medication dose${n > 1 ? 's' : ''} not signed today`, href: `/residents/${rid}?tab=mar` });

  // Fire drills this month
  const drilled = new Set((drills ?? []).map((d) => d.home_id));
  for (const h of homes ?? []) if (!drilled.has(h.id)) alerts.push({ level: 'warn', text: `${h.name}: no fire drill yet this month`, href: `/homes/${h.id}?tab=safety` });

  // Family messages
  const unreadBy = {};
  for (const m of unread ?? []) unreadBy[m.resident_id] = (unreadBy[m.resident_id] ?? 0) + 1;
  for (const [rid, n] of Object.entries(unreadBy)) alerts.push({ level: 'warn', text: `${name(rById[rid])}: ${n} unread family message${n > 1 ? 's' : ''}`, href: `/residents/${rid}?tab=messages` });

  // Certificates
  for (const c of certs ?? []) {
    if (c.profiles && !c.profiles.active) continue;
    const s = certStatus(c.expires_on);
    alerts.push({ level: s.key === 'expired' ? 'bad' : 'warn', text: `${c.profiles?.full_name ?? 'Staff'}: ${c.cert_type} — ${s.label}`, href: `/hr/${c.profile_id}` });
  }

  if (pendingTime?.length) alerts.push({ level: 'warn', text: `${pendingTime.length} timesheet entr${pendingTime.length > 1 ? 'ies' : 'y'} waiting for approval`, href: '/timesheet' });

  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
  const bad = alerts.filter((a) => a.level === 'bad').length;

  return (
    <main>
      <h1>Today — {fmtDate(today)}</h1>
      <div className="stats">
        <div className={`stat ${bad ? 'bad' : ''}`}><strong>{bad}</strong><span>urgent</span></div>
        <div className={`stat ${alerts.length - bad ? 'warn' : ''}`}><strong>{alerts.length - bad}</strong><span>to do soon</span></div>
        <div className="stat"><strong>{residents?.length ?? 0}</strong><span>residents</span></div>
        <div className="stat"><strong>{(incidents ?? []).length}</strong><span>open incidents</span></div>
      </div>

      <h2>Needs attention</h2>
      {alerts.length === 0 && <p className="muted">All clear.</p>}
      <ul className="alerts">
        {alerts.map((a, i) => (
          <li key={i} className={a.level}><Link href={a.href}>{a.level === 'bad' ? '!' : '•'} {a.text}</Link></li>
        ))}
      </ul>

      <div className="grid2">
        <div>
          <h2>On shift today</h2>
          {shifts?.length === 0 && <p className="muted">No shifts scheduled. <Link href="/schedule">Open schedule</Link></p>}
          <ul className="agenda">
            {shifts?.map((s) => (
              <li key={s.id}><span className="when">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</span>
                <span><strong>{s.profiles?.full_name ?? 'OPEN SHIFT'}</strong><span className="muted small"> · {s.homes?.name}{s.label && ` · ${s.label}`}</span></span></li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Appointments today</h2>
          {appts?.length === 0 && <p className="muted">None.</p>}
          <ul className="agenda">
            {appts?.map((a) => (
              <li key={a.id}><span className="when">{a.start_time ? fmtTime(a.start_time) : 'All day'}</span>
                <span><strong>{a.title}</strong><span className="muted small"> · {a.residents ? `${a.residents.first_name} ${a.residents.last_name}` : a.homes?.name}</span></span></li>
            ))}
          </ul>
        </div>
      </div>

      <h2>Communication book (last 3 days)</h2>
      {commbook?.length === 0 && <p className="muted">No new messages.</p>}
      <ul className="timeline">
        {commbook?.map((e) => (
          <li key={e.id} className={e.data?.priority === 'Important' ? 'important' : ''}>
            <div className="meta">{e.homes?.name} · {fmtDate(e.entry_date)}{e.entry_time && ` · ${fmtTime(e.entry_time)}`} · {e.author?.full_name ?? 'Staff'}</div>
            <p>{ENTRY_TYPES.commbook.summary(e.data ?? {})}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
