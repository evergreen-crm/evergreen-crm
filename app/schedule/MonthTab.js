// 🗓 30-day calendar — what the Schedule page opens on, every time (Melvin, Oct 26 2026).
// Everyone sees the next 30 days for their house (or all houses), with their own shifts in green
// and open shifts in orange. ← / → moves 30 days at a time.
import Link from 'next/link';
import { addDaysISO, weekStart, todayISO, fmtDate, fmtTime } from '@/lib/options';
import { levelOf } from '@/lib/levels';

const LETTER = { Day: 'D', Evening: 'E', 'Awake night': 'N', 'Extra 3–7 pm': '3–7', 'Sleep night': 'SN', 'On-call': 'OC' };
const first = (n) => String(n ?? '').split(' ')[0];

export default async function MonthTab({ supabase, profile, homeId: homeParam, from: fromParam }) {
  const today = todayISO();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam ?? '') ? fromParam : today;
  const to = addDaysISO(from, 29);
  const gridStart = weekStart(from);
  const cells = Math.ceil((((new Date(to + 'T12:00:00Z') - new Date(gridStart + 'T12:00:00Z')) / 864e5) + 1) / 7) * 7;
  const lead = levelOf(profile) >= 2 || profile.role === 'admin';
  const homeId = homeParam ?? (profile.home_id && levelOf(profile) <= 2 ? profile.home_id : '');

  // Only the houses in my program (supabase/schedule-privacy.sql).
  let { data: homes, error: hErr } = await supabase.rpc('schedule_homes');
  if (hErr) ({ data: homes } = await supabase.from('homes').select('id, name').order('name'));
  let q = supabase.from('shifts').select('id, shift_date, start_time, end_time, label, profile_id, offered, cover_needed_at, open_reason, home_id, who:profile_id(full_name)')
    .gte('shift_date', from).lte('shift_date', to);
  if (homeId) q = q.eq('home_id', homeId);
  const { data: shifts } = await q.order('shift_date').order('start_time').limit(3000);
  const byDay = {};
  for (const s of shifts ?? []) (byDay[s.shift_date] ??= []).push(s);
  const homeName = Object.fromEntries((homes ?? []).map((h) => [h.id, h.name]));
  const mineCount = (shifts ?? []).filter((s) => s.profile_id === profile.id).length;
  const openCount = (shifts ?? []).filter((s) => !s.profile_id).length;
  const link = (o) => '/schedule?' + new URLSearchParams({ tab: 'month', ...(homeId && { home: homeId }), from, ...o }).toString();
  const multi = !homeId && (homes ?? []).length > 1;

  return (
    <>
      <div className="title-row no-print" style={{ marginTop: 8 }}>
        <strong>{fmtDate(from)} – {fmtDate(to)}</strong>
        <span className="small">
          <Link href={link({ from: addDaysISO(from, -30) })}>← 30 days</Link>{' · '}
          <Link href={link({ from: today })}>Today</Link>{' · '}
          <Link href={link({ from: addDaysISO(from, 30) })}>30 days →</Link>
        </span>
      </div>
      <form className="row no-print" action="/schedule" style={{ alignItems: 'flex-end' }}>
        <input type="hidden" name="tab" value="month" /><input type="hidden" name="from" value={from} />
        <label>House<select name="home" defaultValue={homeId}><option value="">{(homes ?? []).length > 1 ? 'All my houses' : 'My house'}</option>{(homes ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <button className="secondary">Show</button>
        <span className="small muted">You work <strong>{mineCount}</strong> shift{mineCount === 1 ? '' : 's'} in these 30 days{openCount ? <> · <strong>{openCount}</strong> open shift{openCount === 1 ? '' : 's'} — <Link href="/schedule?tab=open">pick one up</Link></> : ''}.</span>
      </form>
      <div className="cal30-head">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="cal30">
        {Array.from({ length: cells }, (_, i) => {
          const d = addDaysISO(gridStart, i);
          const out = d < from || d > to;
          const list = out ? [] : byDay[d] ?? [];
          const mine = list.filter((s) => s.profile_id === profile.id);
          const dom = Number(d.slice(8));
          return (
            <div key={d} className={`cal30-day${out ? ' out' : ''}${d === today ? ' today' : ''}${mine.length ? ' work' : ''}`}>
              <div className="cal30-num">{dom === 1 || d === from ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : dom}</div>
              {list.map((s) => {
                const me = s.profile_id === profile.id;
                const open = !s.profile_id;
                return (
                  <span key={s.id} className={`cal30-chip${me ? ' me' : ''}${open ? ' open' : ''}${s.cover_needed_at ? ' urgent' : ''}`}
                    title={`${s.label ?? ''} ${fmtTime(s.start_time)}–${fmtTime(s.end_time)} · ${open ? 'GAP' + (s.open_reason ? ': ' + s.open_reason : '') : s.who?.full_name ?? ''}${multi ? ' · ' + (homeName[s.home_id] ?? '') : ''}`}>
                    <b>{LETTER[s.label] ?? (s.label ?? '').slice(0, 2)}</b> {me ? 'Me' : open ? 'GAP' : first(s.who?.full_name)}{multi ? <i> {String(homeName[s.home_id] ?? '').slice(0, 10)}</i> : null}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="muted small">D = day (7–3) · E = evening (3–11) · N = awake night (11–7) · 3–7 = extra 3–7 pm. <span className="cal30-chip me"><b>D</b> Me</span> your shift · <span className="cal30-chip open"><b>D</b> GAP</span> nobody on it yet (time off, a call-in, or an empty line). Tap a GAP chip’s hover text for the reason. {lead ? 'To add or remove shifts by hand, use the Week tab.' : <>See all 6 months on <Link href="/schedule?tab=mine">My 6 months</Link>.</>}</p>
    </>
  );
}
