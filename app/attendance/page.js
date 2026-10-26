// ⏰ Attendance board (Program Coordinator: own house · Program Manager and up: every house · Payroll: sick days).
// Today's shifts and who is in, possible no-shows to confirm or excuse, sick shifts that still need cover,
// people still clocked in after their shift, and this month's late arrivals / no-shows / sick calls per person.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf, groupOf } from '@/lib/levels';
import { fmtDate, todayISO, addDaysISO } from '@/lib/options';
import { plainError } from '@/lib/plain';
import { shiftTimes, clock, ABSENCE_TONE, PAID_SICK_DAYS } from '@/lib/attendance';
import { decideAbsence } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attendance · Evergreen' };

export default async function Attendance({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile), grp = groupOf(profile);
  const payroll = grp === 'payroll';
  const pc = lvl === 2 && !grp;
  if (!(lvl >= 3 && !grp) && !pc && !payroll) redirect('/absence');
  const today = todayISO(), monthStart = today.slice(0, 7) + '-01', yearStart = today.slice(0, 4) + '-01-01';
  const house = pc ? profile.home_id : null;
  const byHouse = (q) => (house ? q.eq('home_id', house) : q);

  const [homesR, shiftsR, entriesR, absR, coverR, openR, peopleR] = await Promise.all([
    house ? supabase.from('homes').select('id, name, on_call_phone').eq('id', house) : supabase.from('homes').select('id, name, on_call_phone').order('name'),
    byHouse(supabase.from('shifts').select('id, shift_date, start_time, end_time, label, home_id, profile_id, open_reason, cover_needed_at, who:profile_id(full_name)')
      .gte('shift_date', addDaysISO(today, -1)).lte('shift_date', today).order('start_time')),
    byHouse(supabase.from('time_entries').select('id, profile_id, home_id, shift_id, clock_in, clock_out, late_minutes, late_reason, overtime_minutes, unscheduled, who:profile_id(full_name)')
      .gte('clock_in', new Date(Date.now() - 3 * 864e5).toISOString())),
    byHouse(supabase.from('shift_absences').select('id, shift_id, profile_id, home_id, shift_date, shift_label, starts_at, kind, status, hours_notice, eta_minutes, note, reported_at, decision_note, who:profile_id(full_name)')
      .gte('shift_date', yearStart).order('reported_at', { ascending: false }).limit(2000)),
    byHouse(supabase.from('shifts').select('id, shift_date, start_time, end_time, label, home_id, open_reason, cover_needed_at, cover_all_at, cover_pm_at')
      .is('profile_id', null).not('cover_needed_at', 'is', null).gte('shift_date', addDaysISO(today, -1)).order('shift_date').order('start_time')),
    byHouse(supabase.from('time_entries').select('id, profile_id, home_id, shift_id, clock_in, who:profile_id(full_name)').is('clock_out', null)),
    supabase.from('profiles').select('id, full_name, home_id, level, role, staff_group, active').eq('active', true).neq('role', 'family').order('full_name'),
  ]);
  const notReady = [shiftsR, absR, coverR].some((r) => r.error && /column|relation|schema/i.test(r.error.message));
  const homes = homesR.data ?? [];
  const homeName = Object.fromEntries(homes.map((h) => [h.id, h.name]));
  const entries = entriesR.data ?? [];
  const entryByShift = Object.fromEntries(entries.filter((e) => e.shift_id).map((e) => [e.shift_id, e]));
  const abs = absR.data ?? [];
  const absByShift = {};
  for (const a of abs) if (a.shift_id) (absByShift[a.shift_id] ??= []).push(a);
  const now = new Date();

  // Today's board: shifts that end after midnight last night and start today or earlier.
  const todays = (shiftsR.data ?? []).map((s) => ({ ...s, ...shiftTimes(s) }))
    .filter((s) => s.end > new Date(now.getTime() - 6 * 3600000) && s.start < new Date(now.getTime() + 18 * 3600000))
    .sort((a, b) => a.start - b.start);
  // Called-in shifts no longer carry the person; show them from the absence records.
  const status = (s) => {
    const e = entryByShift[s.id];
    const list = absByShift[s.id] ?? [];
    const called = list.find((a) => ['Sick', 'Family emergency', 'Other'].includes(a.kind));
    if (e) {
      if (e.clock_out) return { tone: '', text: `✓ Worked ${clock(new Date(e.clock_in))}–${clock(new Date(e.clock_out))}${e.overtime_minutes ? ` · stayed ${e.overtime_minutes} min late` : ''}` };
      return { tone: e.late_minutes ? 'warn' : '', text: `✓ In since ${clock(new Date(e.clock_in))}${e.late_minutes ? ` · ${e.late_minutes} min late${e.late_reason ? ` (“${e.late_reason}”)` : ''}` : ''}` };
    }
    if (!s.profile_id) return { tone: 'bad', text: called ? `📞 ${called.who?.full_name ?? 'Staff'} called in (${called.kind.toLowerCase()}) — needs cover` : `Open — ${s.open_reason ?? 'nobody on it'}` };
    const late = list.find((a) => a.status === 'Running late');
    const noshow = list.find((a) => ['Possible no-show', 'No-show'].includes(a.status));
    if (noshow) return { tone: 'bad', text: noshow.status === 'No-show' ? '⛔ No-show (confirmed)' : '⏰ Possible no-show — confirm below' };
    if (late) return { tone: 'warn', text: `⏰ Running late, about ${late.eta_minutes} min` };
    if (s.start <= now) return { tone: 'bad', text: `Not clocked in (${Math.round((now - s.start) / 60000)} min)` };
    return { tone: '', text: `Starts ${clock(s.start)}` };
  };

  const toDecide = abs.filter((a) => a.status === 'Possible no-show');
  const cover = (coverR.data ?? []).map((s) => ({ ...s, ...shiftTimes(s) })).filter((s) => s.end > now);
  const stillIn = (openR.data ?? []).map((e) => {
    const s = (shiftsR.data ?? []).find((x) => x.id === e.shift_id);
    const end = s ? shiftTimes(s).end : new Date(new Date(e.clock_in).getTime() + 9 * 3600000);
    return { ...e, end };
  }).filter((e) => now - e.end > 30 * 60000);

  // This month and this year, per person.
  const month = {};
  const bump = (pid, k) => { (month[pid] ??= { late: 0, noshow: 0, sick: 0, other: 0 })[k]++; };
  for (const e of entries) if (e.late_minutes && e.clock_in.slice(0, 10) >= monthStart) bump(e.profile_id, 'late');
  for (const a of abs) {
    if (a.shift_date < monthStart) continue;
    if (a.status === 'No-show') bump(a.profile_id, 'noshow');
    if (a.status === 'Called in') bump(a.profile_id, a.kind === 'Sick' ? 'sick' : 'other');
  }
  const sickYear = {};
  for (const a of abs) if (a.kind === 'Sick' && a.status === 'Called in') (sickYear[a.profile_id] ??= new Set()).add(a.shift_date);
  const people = (peopleR.data ?? []).filter((p) => !house || p.home_id === house);
  const nameOf = Object.fromEntries((peopleR.data ?? []).map((p) => [p.id, p.full_name]));

  return (
    <main>
      <h1>⏰ Attendance{house ? ` · ${homeName[house] ?? ''}` : ''}</h1>
      <p className="small muted">Clock in up to 15 min early · late after 5 min · not clocked in after 15 min → alert to the Program Coordinator, after 30 min → Program Manager and a possible no-show to confirm here. Sick calls never count against the badge.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message error">{plainError(sp.error)}</p>}
      {notReady && <p className="message">Run supabase/attendance.sql in Supabase first.</p>}

      {!payroll && toDecide.length > 0 && (
        <section className="card rh-urgent">
          <h2 style={{ marginTop: 0 }}>⏰ Possible no-shows to confirm</h2>
          {toDecide.map((a) => (
            <div key={a.id} className="req-row">
              <p style={{ margin: 0 }}><strong>{a.who?.full_name}</strong> · {fmtDate(a.shift_date)} {a.shift_label} at {clock(new Date(a.starts_at))} · {homeName[a.home_id] ?? ''}</p>
              <form action={decideAbsence} className="row" style={{ gap: 8, alignItems: 'end' }}>
                <input type="hidden" name="id" value={a.id} />
                <label>Note (optional)<input name="note" maxLength={300} placeholder="e.g. Called on-call at 3:10, car broke down" /></label>
                <button name="status" value="Excused" className="secondary">✅ Excuse</button>
                <button name="status" value="No-show">⛔ Record no-show</button>
              </form>
            </div>
          ))}
          <p className="muted small">Excuse it if they phoned in, or there was a real emergency. A confirmed no-show counts toward the badge (Red).</p>
        </section>
      )}

      {!payroll && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Today</h2>
          {!todays.length && <p className="muted">No shifts today.</p>}
          {homes.filter((h) => todays.some((s) => s.home_id === h.id)).map((h) => (
            <div key={h.id} style={{ marginBottom: 12 }}>
              <h3 style={{ margin: '6px 0' }}>🏡 {h.name}{h.on_call_phone ? <span className="muted small"> · on-call {h.on_call_phone}</span> : null}</h3>
              <div className="table-wrap">
                <table className="qa-table">
                  <thead><tr><th>Shift</th><th>Who</th><th>Status</th></tr></thead>
                  <tbody>{todays.filter((s) => s.home_id === h.id).map((s) => {
                    const st = status(s);
                    return <tr key={s.id}><td className="small">{s.label} {clock(s.start)}–{clock(s.end)}</td><td>{s.who?.full_name ?? <span className="muted">—</span>}</td><td><span className={`badge ${st.tone}`}>{st.text}</span></td></tr>;
                  })}</tbody>
                </table>
              </div>
            </div>
          ))}
          {entries.filter((e) => e.unscheduled && !e.clock_out).length > 0 && (
            <p className="small">🕒 Clocked in without a scheduled shift: {entries.filter((e) => e.unscheduled && !e.clock_out).map((e) => `${e.who?.full_name} (${homeName[e.home_id] ?? ''}, since ${clock(new Date(e.clock_in))})`).join(' · ')}</p>
          )}
        </section>
      )}

      {!payroll && (
        <section className={`card ${cover.length ? 'rh-urgent' : ''}`}>
          <h2 style={{ marginTop: 0 }}>📞 Shifts that need cover</h2>
          {!cover.length ? <p className="muted small">None. ✓</p> : (
            <ul className="list compact">{cover.map((s) => {
              const who = (absByShift[s.id] ?? []).find((a) => ['Sick', 'Family emergency', 'Other'].includes(a.kind));
              return (
                <li key={s.id}>
                  <span><strong>{fmtDate(s.shift_date)} · {s.label} {clock(s.start)}</strong> · {homeName[s.home_id] ?? ''}
                    <span className="muted small"> · {who ? `${who.who?.full_name} called in (${who.kind.toLowerCase()})` : s.open_reason}{s.cover_all_at ? ' · offered to all houses' : ' · offered to this house'}{s.cover_pm_at ? ' · PM told' : ''}</span></span>
                  <Link className="small" href="/schedule?tab=open">Assign →</Link>
                </li>
              );
            })}</ul>
          )}
        </section>
      )}

      {!payroll && stillIn.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>⏱ Still clocked in after their shift</h2>
          <ul className="list compact">{stillIn.map((e) => <li key={e.id}><span>{e.who?.full_name} · {homeName[e.home_id] ?? ''} · shift ended {clock(e.end)}</span><Link className="small" href="/timesheet">Fix the time →</Link></li>)}</ul>
          <p className="muted small">Check they are safe first. Then fix the clock-out time on the timesheet (every change is logged).</p>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{payroll ? 'Sick days this year' : 'This month, per person'}</h2>
        <div className="table-wrap">
          <table className="qa-table">
            <thead><tr><th>Staff</th>{!payroll && <><th>Late arrivals</th><th>No-shows</th></>}<th>Sick calls{payroll ? '' : ' (month)'}</th><th>Sick days this year</th></tr></thead>
            <tbody>{people.filter((p) => month[p.id] || sickYear[p.id]).map((p) => {
              const m = month[p.id] ?? { late: 0, noshow: 0, sick: 0, other: 0 };
              const sy = sickYear[p.id]?.size ?? 0;
              return (
                <tr key={p.id}>
                  <td>{p.full_name}</td>
                  {!payroll && <><td className={`qa-cell qa-${m.late >= 4 ? 'red' : m.late >= 2 ? 'yellow' : 'none'}`}>{m.late}</td>
                    <td className={`qa-cell qa-${m.noshow ? 'red' : 'none'}`}>{m.noshow}</td></>}
                  <td>{payroll ? sy : m.sick + m.other}</td>
                  <td className={sy > PAID_SICK_DAYS ? 'bad-text' : ''}>{sy} / {PAID_SICK_DAYS} paid</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        {!people.some((p) => month[p.id] || sickYear[p.id]) && <p className="muted small">Nothing recorded yet.</p>}
        {!payroll && <p className="muted small">For the monthly badge: 2–3 late arrivals = 🟡, 4 or more or any confirmed no-show = 🔴. Sick calls never count. <Link href="/badges">Set badges →</Link></p>}
      </section>

      {!payroll && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Recent call-ins and late notices</h2>
          {!abs.length ? <p className="muted small">None yet.</p> : (
            <ul className="list compact">{abs.slice(0, 40).map((a) => (
              <li key={a.id}><span className="small">{fmtDate(a.shift_date)} · {a.shift_label ?? ''} · {homeName[a.home_id] ?? ''} — <strong>{a.who?.full_name ?? nameOf[a.profile_id] ?? ''}</strong>: {a.kind}{a.eta_minutes ? ` (~${a.eta_minutes} min)` : ''}{a.hours_notice !== null && a.hours_notice !== undefined && ['Sick', 'Family emergency', 'Other'].includes(a.kind) ? ` · ${a.hours_notice < 4 ? '⚠️ ' : ''}${a.hours_notice} h notice` : ''}{a.note ? ` · “${a.note}”` : ''}</span>
                <span className={`badge ${ABSENCE_TONE[a.status] ?? ''}`}>{a.status}</span></li>
            ))}</ul>
          )}
        </section>
      )}
    </main>
  );
}
