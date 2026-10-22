// Automatic schedule tabs: My shifts, Open shifts, Time off, Teams. Server components.
import Link from 'next/link';
import { addDaysISO, fmtDate, fmtTime, todayISO } from '@/lib/options';
import { levelOf } from '@/lib/levels';
import NotReady from '@/app/components/NotReady';
import { saveStaffing, assignLine, pickUp, offerShift, decidePickup, requestTimeOff, decideTimeOff, addProtectedDay, removeProtectedDay } from './teams-actions';

const A = new Set([0, 1, 4, 5, 6, 8, 9, 10, 11]);
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
export const works = (slot, pair, day, anchor) => {
  const k = (((daysBetween(anchor, day) + (pair % 2 === 0 ? 7 : 0)) % 14) + 14) % 14;
  return slot === 'A' ? A.has(k) : !A.has(k);
};
const SHIFT_NAME = { Day: 'Day team', Evening: 'Evening team', Night: 'Night team (awake)', Peak: '3–7 pm extra' };
const notReady = (e) => e && /does not exist|schema cache|column/i.test(e.message);
const when = (x) => `${new Date(x.shift_date + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })} · ${fmtTime(x.start_time)}–${fmtTime(x.end_time)}`;

export function TabBar({ tab, lead }) {
  const t = [['week', 'Week'], ['mine', 'My shifts'], ['open', 'Open shifts'], ['timeoff', 'Time off'], ...(lead ? [['teams', 'Teams & lines']] : [])];
  return <nav className="tabs-bar no-print">{t.map(([k, l]) => <Link key={k} href={`/schedule?tab=${k}`} className={tab === k ? 'on' : ''}>{l}</Link>)}</nav>;
}

// ---------- My shifts + protected days ----------
export async function MyTab({ supabase, profile }) {
  const today = todayISO();
  const [shifts, prot, line, settings] = await Promise.all([
    supabase.from('shifts').select('id, shift_date, start_time, end_time, label, offered, homes(name)').eq('profile_id', profile.id).gte('shift_date', today).lte('shift_date', addDaysISO(today, 56)).order('shift_date'),
    supabase.from('protected_days').select('day').eq('profile_id', profile.id).gte('day', today).order('day'),
    supabase.from('schedule_lines').select('shift, pair, slot, homes(name)').eq('profile_id', profile.id).eq('active', true).maybeSingle(),
    supabase.from('schedule_settings').select('pattern_anchor').maybeSingle(),
  ]);
  if (notReady(shifts.error) || notReady(prot.error)) return <NotReady what="The automatic schedule" file="schedule-teams.sql" />;
  const l = line.data; const anchor = settings.data?.pattern_anchor;
  const two = Array.from({ length: 14 }, (_, i) => addDaysISO(anchor ?? today, i));
  return (
    <>
      {l && anchor && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>My pattern: {SHIFT_NAME[l.shift]} · {l.homes?.name}</h2>
          <p className="small muted">{l.slot === 'A' ? 'Full-time line: 9 shifts every 2 weeks (36 hours a week on average).' : 'Weekend-partner line: 5 shifts every 2 weeks (20 hours a week).'} It repeats every two weeks, and every other weekend is off.</p>
          <PatternRow slot={l.slot} pair={l.pair} anchor={anchor} days={two} />
        </section>
      )}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>My next 8 weeks</h2>
        {!(shifts.data ?? []).length && <p className="muted">No shifts posted yet.</p>}
        <ul className="list compact">
          {(shifts.data ?? []).map((x) => (
            <li key={x.id}>
              <span><strong>{when(x)}</strong> · {x.label} · {x.homes?.name}{x.offered && <span className="badge warn"> Offered</span>}</span>
              <form action={offerShift} className="row" style={{ gap: 6 }}>
                <input type="hidden" name="shift_id" value={x.id} />
                {x.offered
                  ? <button name="offer" value="0" className="link small">Keep it</button>
                  : <><input name="note" placeholder="Why (optional)" className="small" style={{ maxWidth: 160 }} /><button name="offer" value="1" className="link small">Offer to a coworker</button></>}
              </form>
            </li>
          ))}
        </ul>
        <p className="muted small">Offering a shift doesn’t give it away: you keep it until a coworker asks for it and the Program Coordinator approves the swap.</p>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>My protected days</h2>
        <p className="small">Pick up to 2 days a month (at least a week ahead) when you won’t be asked to pick up open shifts: a school play, an appointment, family time.</p>
        <ul className="list compact">{(prot.data ?? []).map((p) => (
          <li key={p.day}><span>{fmtDate(p.day)}</span><form action={removeProtectedDay}><input type="hidden" name="day" value={p.day} /><button className="link small">Remove</button></form></li>
        ))}</ul>
        <form action={addProtectedDay} className="row" style={{ alignItems: 'flex-end' }}>
          <label>Day<input type="date" name="day" required min={addDaysISO(today, 7)} /></label>
          <button className="secondary">Protect this day</button>
        </form>
      </section>
    </>
  );
}

function PatternRow({ slot, pair, anchor, days }) {
  return (
    <div className="pat-row">
      {days.map((d, i) => {
        const on = works(slot, pair, d, anchor);
        const dow = new Date(d + 'T12:00:00Z').getUTCDay();
        return <span key={d} className={`pat ${on ? 'on' : ''} ${dow === 0 || dow === 6 ? 'we' : ''}`} title={fmtDate(d)}>{'SMTWTFS'[dow]}</span>;
      })}
    </div>
  );
}

// ---------- Open shifts + swaps to approve ----------
export async function OpenTab({ supabase, profile }) {
  const today = todayISO();
  const lead = levelOf(profile) >= 2;
  const [open, pick] = await Promise.all([
    supabase.from('shifts').select('id, shift_date, start_time, end_time, label, open_reason, offered, offered_note, profile_id, homes(name), owner:profile_id(full_name)')
      .gte('shift_date', today).lte('shift_date', addDaysISO(today, 30)).or('profile_id.is.null,offered.eq.true').order('shift_date').order('start_time').limit(200),
    supabase.from('shift_pickups').select('id, status, created_at, shifts(shift_date, start_time, end_time, label, homes(name)), asker:to_profile(full_name), owner:from_profile(full_name)').eq('status', 'Pending'),
  ]);
  if (notReady(open.error)) return <NotReady what="Open shifts" file="schedule-teams.sql" />;
  const list = (open.data ?? []).filter((x) => x.profile_id !== profile.id);
  const gaps = list.filter((x) => !x.profile_id && x.open_reason === 'No one on this line yet');
  const real = list.filter((x) => !(!x.profile_id && x.open_reason === 'No one on this line yet'));
  return (
    <>
      {lead && (pick.data ?? []).length > 0 && (
        <section className="card rh-urgent">
          <h2 style={{ marginTop: 0 }}>Swaps to approve</h2>
          {(pick.data ?? []).map((p) => (
            <div key={p.id} className="req-row">
              <p style={{ margin: 0 }}><strong>{p.asker?.full_name}</strong> wants to take <strong>{p.owner?.full_name}</strong>’s {p.shifts?.label} shift · {p.shifts && when(p.shifts)} · {p.shifts?.homes?.name}</p>
              <form action={decidePickup} className="row" style={{ gap: 8 }}>
                <input type="hidden" name="id" value={p.id} />
                <button name="decision" value="approve">✅ Approve</button>
                <button name="decision" value="decline" className="secondary">⛔ Decline</button>
              </form>
            </div>
          ))}
          <p className="muted small">The CRM checks rest (11 hours between shifts), weekly hours (full-time 40, part-time 36) and days in a row before it lets a swap through.</p>
        </section>
      )}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Open shifts — next 30 days</h2>
        {!real.length && <p className="muted">No open shifts right now. ✓</p>}
        <ul className="list compact">
          {real.map((x) => (
            <li key={x.id}>
              <span><strong>{when(x)}</strong> · {x.label} · {x.homes?.name}
                <span className="muted small"> · {x.profile_id ? `Offered by ${x.owner?.full_name}${x.offered_note ? ` — “${x.offered_note}”` : ''}` : (x.open_reason ?? 'Open')}</span></span>
              <form action={pickUp}><input type="hidden" name="shift_id" value={x.id} /><button className={x.profile_id ? 'secondary' : ''}>{x.profile_id ? 'Ask to take it' : 'Pick up'}</button></form>
            </li>
          ))}
        </ul>
        <p className="muted small">Picking up checks your rest and hours first. An open shift is yours straight away; an offered shift needs the Program Coordinator’s OK.</p>
      </section>
      {lead && gaps.length > 0 && (
        <p className="message">👥 {gaps.length} shift{gaps.length === 1 ? '' : 's'} in the next 30 days {gaps.length === 1 ? 'is' : 'are'} on lines with nobody assigned. <Link href="/schedule?tab=teams">Assign staff on Teams & lines →</Link></p>
      )}
    </>
  );
}

// ---------- Time off ----------
export async function TimeOffTab({ supabase, profile }) {
  const today = todayISO();
  const lead = levelOf(profile) >= 2;
  const { data, error } = await supabase.from('time_off_requests').select('*, who:profile_id(full_name, home_id), decider:decided_by(full_name)')
    .gte('end_date', addDaysISO(today, -60)).order('start_date');
  if (notReady(error)) return <NotReady what="Time off requests" file="schedule-teams.sql" />;
  const all = data ?? [];
  const mine = all.filter((r) => r.profile_id === profile.id);
  const pending = all.filter((r) => r.profile_id !== profile.id && r.status === 'Pending');
  const span = (r) => `${fmtDate(r.start_date)}${r.end_date !== r.start_date ? ` – ${fmtDate(r.end_date)}` : ''}`;
  return (
    <>
      {lead && (
        <section className={`card${pending.length ? ' rh-urgent' : ''}`}>
          <h2 style={{ marginTop: 0 }}>Waiting for your answer {pending.length > 0 && <span className="badge warn">{pending.length}</span>}</h2>
          {!pending.length && <p className="muted">Nothing waiting. ✓</p>}
          {pending.map((r) => (
            <div key={r.id} className="req-row">
              <p style={{ margin: 0 }}><strong>{r.who?.full_name}</strong> · {r.kind} · {span(r)}{r.start_date < addDaysISO(today, 28) && ['Vacation', 'Personal'].includes(r.kind) && <span className="badge warn"> under 4 weeks’ notice</span>}</p>
              {r.note && <p className="small" style={{ margin: '2px 0' }}>“{r.note}”</p>}
              <form action={decideTimeOff} className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                <input type="hidden" name="id" value={r.id} />
                <label>Message (optional)<input name="note" /></label>
                <button name="decision" value="approve">✅ Approve</button>
                <button name="decision" value="decline" className="secondary">⛔ Decline</button>
              </form>
            </div>
          ))}
          <p className="muted small">Approving opens their shifts in those dates for the part-time and casual pick-up pool.</p>
        </section>
      )}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Ask for time off</h2>
        <form action={requestTimeOff}>
          <div className="row">
            <label>First day<input type="date" name="start_date" required /></label>
            <label>Last day<input type="date" name="end_date" /></label>
            <label>Kind<select name="kind" defaultValue="Vacation">{['Vacation', 'Personal', 'Family', 'Sick', 'Other'].map((k) => <option key={k}>{k}</option>)}</select></label>
          </div>
          <label>Note (optional)<input name="note" placeholder="e.g. Kids’ spring break" /></label>
          <button>Send request</button>
        </form>
        <p className="muted small">Please ask at least 4 weeks ahead for vacation. Christmas and New Year alternate year by year, and school breaks are shared fairly.</p>
        {mine.length > 0 && (
          <ul className="list compact">{mine.map((r) => (
            <li key={r.id}><span>{r.kind} · {span(r)}{r.decision_note && <span className="muted small"> — {r.decision_note}</span>}</span>
              <span className="row" style={{ gap: 6 }}>
                <span className={`badge ${r.status === 'Declined' ? 'bad' : r.status === 'Pending' ? 'warn' : ''}`}>{r.status}</span>
                {r.status === 'Pending' && <form action={decideTimeOff}><input type="hidden" name="id" value={r.id} /><button name="decision" value="cancel" className="link small">Cancel</button></form>}
              </span></li>
          ))}</ul>
        )}
      </section>
    </>
  );
}

// ---------- Teams & lines (Program Coordinator: own house; Program Manager and up: all) ----------
export async function TeamsTab({ supabase, profile, homeId }) {
  const lvl = levelOf(profile);
  let hq = supabase.from('homes').select('id, name, staff_day, staff_evening, staff_night, staff_peak, schedule_from').order('name');
  if (lvl < 3 && profile.role !== 'admin') hq = hq.eq('id', profile.home_id ?? '00000000-0000-0000-0000-000000000000');
  const [homes, settings] = await Promise.all([hq, supabase.from('schedule_settings').select('*').maybeSingle()]);
  if (notReady(homes.error)) return <NotReady what="Teams & lines" file="schedule-teams.sql" />;
  const home = (homes.data ?? []).find((h) => h.id === homeId) ?? (homes.data ?? [])[0];
  if (!home) return <p className="muted">No house to set up.</p>;
  const [lines, people, details] = await Promise.all([
    supabase.from('schedule_lines').select('id, shift, pair, slot, profile_id, active').eq('home_id', home.id).eq('active', true),
    supabase.from('profiles').select('id, full_name, home_id, level').in('role', ['staff', 'manager']).eq('active', true).is('staff_group', null).order('full_name'),
    supabase.from('staff_details').select('profile_id, employment_type'),
  ]);
  const st = settings.data;
  const anchor = st?.pattern_anchor;
  const empType = Object.fromEntries((details.data ?? []).map((d) => [d.profile_id, d.employment_type]));
  const taken = new Set((lines.data ?? []).map((l) => l.profile_id).filter(Boolean));
  const order = { Day: 0, Evening: 1, Night: 2, Peak: 3 };
  const ls = (lines.data ?? []).sort((a, b) => order[a.shift] - order[b.shift] || a.pair - b.pair || a.slot.localeCompare(b.slot));
  const days = anchor ? Array.from({ length: 14 }, (_, i) => addDaysISO(anchor, i)) : [];
  const people2 = (people.data ?? []).filter((p) => (p.level ?? 1) <= 2);
  return (
    <>
      {(homes.data ?? []).length > 1 && (
        <nav className="tabs-bar">{(homes.data ?? []).map((h) => <Link key={h.id} href={`/schedule?tab=teams&home=${h.id}`} className={h.id === home.id ? 'on' : ''}>{h.name}</Link>)}</nav>
      )}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{home.name}: how many staff on each shift</h2>
        <p className="small muted">Set this from the MCFD / CLBC contract for the youth or adults in this house. 1-bed homes are usually 1 / 1 / 1. A 2-bed home is 2 / 2 / 1, or 1 / 1 / 1 with the 3–7 pm extra.</p>
        <form action={saveStaffing}>
          <input type="hidden" name="home_id" value={home.id} />
          <div className="row">
            <label>Day (7–3)<select name="staff_day" defaultValue={home.staff_day ?? 1}>{[0, 1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label>Evening (3–11)<select name="staff_evening" defaultValue={home.staff_evening ?? 1}>{[0, 1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label>Awake night (11–7)<select name="staff_night" defaultValue={home.staff_night ?? 1}>{[0, 1, 2].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label>Extra 3–7 pm<select name="staff_peak" defaultValue={home.staff_peak ?? 0}>{[0, 1, 2].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label>Pattern starts on<input type="date" name="schedule_from" required defaultValue={home.schedule_from ?? anchor ?? ''} /></label>
          </div>
          <button>Save and post 6 months of shifts</button>
        </form>
        <p className="muted small">Each staff on a shift = one weekend-partner pair: a full-time line (36 h a week) and a part-time line (20 h a week). Shifts already changed by hand, time off or a swap are never overwritten.</p>
      </section>

      {home.schedule_from && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Lines — who is on each one</h2>
          <div className="scroll-x"><table className="lines">
            <thead><tr><th>Team</th><th>Line</th><th>Person</th><th>Two-week pattern {anchor && <span className="muted small">(from {fmtDate(anchor)}, repeats)</span>}</th></tr></thead>
            <tbody>{ls.map((l) => (
              <tr key={l.id}>
                <td>{SHIFT_NAME[l.shift]}{l.pair > 1 ? ` · pair ${l.pair}` : ''}</td>
                <td className="small">{l.slot === 'A' ? (l.shift === 'Peak' ? 'Line A · 18 h' : 'Full-time · 36 h') : (l.shift === 'Peak' ? 'Line B · 10 h' : 'Weekend partner · 20 h')}</td>
                <td>
                  <form action={assignLine} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <input type="hidden" name="home_id" value={home.id} /><input type="hidden" name="line_id" value={l.id} />
                    <select name="profile_id" defaultValue={l.profile_id ?? ''}>
                      <option value="">— Nobody yet —</option>
                      {people2.filter((p) => p.id === l.profile_id || !taken.has(p.id)).map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name}{empType[p.id] ? ` (${empType[p.id]})` : ''}{p.home_id && p.home_id !== home.id ? ' · other house' : ''}</option>
                      ))}
                    </select>
                    <button className="secondary small-btn">Save</button>
                  </form>
                </td>
                <td>{anchor && <PatternRow slot={l.slot} pair={l.pair} anchor={anchor} days={days} />}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="muted small">Green = working. Shaded = Saturday and Sunday. The full-time line works one weekend, its partner the next, so everyone gets every other weekend off. Rules checked on every pick-up and swap: at least {st?.min_rest_hours ?? 11} hours between shifts, at most {st?.max_in_a_row ?? 5} shifts in a row, full-time up to {st?.ft_max_week ?? 40} h and part-time up to {st?.pt_max_week ?? 36} h in a Sunday–Saturday week.</p>
        </section>
      )}
    </>
  );
}
