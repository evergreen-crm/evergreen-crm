// ✅ Shift checklist — every staff member, every shift (3 x 8 hours). Tick each duty, then initial and sign.
// ?view=house — the Program Coordinator / Manager board: today's shifts at a house, who worked, progress, late ones.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDate, fmtDateTime, todayISO, addDaysISO, TZ } from '@/lib/options';
import { SHIFTS, SECTIONS, AREAS, shiftHours, expectedBedChecks, notesForShift } from '@/lib/checklist';
import ChecklistItem from './ChecklistItem';
import { startChecklist, logBedCheck, signChecklist } from './actions';
import NotReady from '@/app/components/NotReady';
import { plainError } from '@/lib/plain';

const time = (ts) => new Date(ts).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
const STATUS_BADGE = { Signed: '', 'In progress': 'warn', Finishing: 'warn', Late: 'bad' };

export default async function Checklist({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  const lead = lvl >= 2;
  const view = lead && sp?.view === 'house' ? 'house' : 'me';

  const [{ data: open }, { data: homes, error: homesErr }] = await Promise.all([
    supabase.from('time_entries').select('home_id').eq('profile_id', user.id).is('clock_out', null).maybeSingle(),
    supabase.from('homes').select('id, name, house_type, shift_day_start, shift_evening_start, shift_night_start, bed_check_minutes').order('name'),
  ]);
  const notReady = !!homesErr;
  const myHomes = lvl >= 3 ? homes ?? [] : (homes ?? []).filter((h) => h.id === profile.home_id || h.id === open?.home_id);
  const defaultHome = sp?.home ?? open?.home_id ?? profile.home_id ?? myHomes[0]?.id ?? null;

  const header = (
    <>
      <div className="div-banner">
        <span className="div-icon">📋</span>
        <div><h1>Shift checklist</h1><p>Every staff member, every shift. Tap each duty as you do it, then initial and sign before you leave.</p></div>
      </div>
      {sp?.ok && <p className="message ok">{sp.ok}</p>}
      {sp?.error && <p className="message error">{plainError(sp.error)}</p>}
      {lead && (
        <nav className="tabs-bar no-print">
          <Link href="/checklist" className={view === 'me' ? 'on' : ''}>My checklist</Link>
          <Link href={`/checklist?view=house${defaultHome ? `&home=${defaultHome}` : ''}`} className={view === 'house' ? 'on' : ''}>House board</Link>
          <Link href={`/checklist/setup${defaultHome ? `?home=${defaultHome}` : ''}`}>⚙️ Set up duties</Link>
        </nav>
      )}
    </>
  );
  if (notReady) return <main>{header}<NotReady what="The shift checklist" file="shift-checklists.sql" /></main>;

  // ---------------- House board ----------------
  if (view === 'house') {
    const home = (homes ?? []).find((h) => h.id === defaultHome);
    const today = todayISO();
    const [{ data: board }, { data: late }] = await Promise.all([
      supabase.from('shift_checklist_board').select('*').eq('home_id', defaultHome).gte('shift_date', addDaysISO(today, -1)).order('starts_at', { ascending: false }),
      supabase.from('shift_checklist_board').select('id, full_name, shift, shift_date, answered, items').eq('home_id', defaultHome).eq('board_status', 'Late').gte('shift_date', addDaysISO(today, -14)).order('shift_date', { ascending: false }),
    ]);
    const hours = shiftHours(home);
    return (
      <main>
        {header}
        <form className="row no-print" style={{ alignItems: 'flex-end', gap: 8 }}>
          <input type="hidden" name="view" value="house" />
          <label>House<select name="home" defaultValue={defaultHome ?? ''}>{myHomes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
          <button className="secondary">Show</button>
        </form>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>{home?.name ?? 'House'} — today and last night</h2>
          <p className="muted small">☀️ Day {hours.Day} · 🌆 Evening {hours.Evening} · 🌙 Night {hours.Night}</p>
          {!board?.length ? <p className="muted">No checklists yet for this period. Checklists start when staff clock in at the house.</p> : (
            <table>
              <thead><tr><th>Shift</th><th>Staff</th><th>Progress</th><th>Problems</th><th>Status</th><th></th></tr></thead>
              <tbody>{board.map((b) => (
                <tr key={b.id}>
                  <td>{SHIFTS[b.shift]?.icon} {b.shift}<div className="muted small">{fmtDate(b.shift_date)}</div></td>
                  <td>{b.full_name}</td>
                  <td><progress max={b.items || 1} value={b.answered} /> <span className="small">{b.answered}/{b.items}</span>
                    {b.shift === 'Night' && <div className="muted small">Bed checks: {b.bed_check_count} of ~{expectedBedChecks(b.bed_check_minutes)}</div>}</td>
                  <td>{b.problems ? <span className="badge bad">{b.problems}</span> : '—'}</td>
                  <td><span className={`badge ${STATUS_BADGE[b.board_status] ?? ''}`}>{b.board_status === 'Signed' ? `✓ Signed ${time(b.signed_at)}` : b.board_status}</span></td>
                  <td><Link href={`/checklist?id=${b.id}`}>Open →</Link></td>
                </tr>))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Not signed — last 14 days</h2>
          {!late?.length ? <p className="muted">None. 🎉</p> : (
            <ul className="list compact">{late.map((l) => <li key={l.id}><Link href={`/checklist?id=${l.id}`}>{l.full_name} · {SHIFTS[l.shift]?.icon} {l.shift} {fmtDate(l.shift_date)}</Link><span className="badge bad">{l.answered}/{l.items}</span></li>)}</ul>
          )}
          <p className="muted small">Staff get a reminder 30 minutes before the shift ends. If a checklist is still not signed 30 minutes after the shift, the staff member, Program Coordinator and Program Manager are notified.</p>
        </section>
      </main>
    );
  }

  // ---------------- My checklist ----------------
  let cl = null;
  if (sp?.id) {
    ({ data: cl } = await supabase.from('shift_checklists').select('*, homes(id, name, bed_check_minutes, shift_day_start, shift_evening_start, shift_night_start), profiles(full_name)').eq('id', sp.id).maybeSingle());
  } else {
    ({ data: cl } = await supabase.from('shift_checklists').select('*, homes(id, name, bed_check_minutes, shift_day_start, shift_evening_start, shift_night_start), profiles(full_name)')
      .eq('profile_id', user.id).gte('ends_at', new Date(Date.now() - 2 * 3600e3).toISOString()).order('starts_at', { ascending: false }).limit(1).maybeSingle());
  }
  const { data: history } = await supabase.from('shift_checklists').select('id, shift, shift_date, status, homes(name)').eq('profile_id', user.id).order('starts_at', { ascending: false }).limit(10);

  if (!cl) {
    return (
      <main>
        {header}
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Start my checklist</h2>
          <p>Your checklist opens by itself when you clock in at a house. You can also start it here.</p>
          {myHomes.length === 0 ? <p className="muted">You are not assigned to a house yet. Ask your Program Coordinator.</p> : (
            <form action={startChecklist} className="row" style={{ alignItems: 'flex-end', gap: 8 }}>
              <label>House<select name="home_id" defaultValue={defaultHome ?? ''}>{myHomes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
              <button>Start this shift’s checklist</button>
            </form>
          )}
        </section>
        <History history={history} />
      </main>
    );
  }

  const mine = cl.profile_id === user.id;
  const locked = !mine || cl.status === 'Signed';
  const { data: ticks } = await supabase.from('shift_checklist_ticks').select('*').eq('checklist_id', cl.id).order('sort');
  const all = ticks ?? [];
  const done = all.filter((t) => t.status).length;
  const left = all.length - done;
  const hours = shiftHours(cl.homes);
  const need = expectedBedChecks(cl.homes?.bed_check_minutes ?? 30);
  const since = new Date(new Date(cl.starts_at).getTime() - 3600e3).toISOString();
  const notes = mine && !locked ? await notesForShift(supabase, { homeId: cl.home_id, userId: user.id, since }) : null;
  const late = cl.status !== 'Signed' && Date.now() > new Date(cl.ends_at).getTime() + 30 * 60e3;

  return (
    <main>
      {header}
      <section className={`card cl-head${late ? ' rh-urgent' : ''}`}>
        <div className="rh-head">
          <div>
            <h2 style={{ margin: 0 }}>{SHIFTS[cl.shift]?.icon} {SHIFTS[cl.shift]?.label} shift · {cl.homes?.name}</h2>
            <p className="muted small" style={{ margin: 0 }}>{fmtDate(cl.shift_date)} · {hours[cl.shift]}{!mine && ` · ${cl.profiles?.full_name}`}</p>
          </div>
          <div className="cl-progress"><strong>{done}/{all.length}</strong><progress max={all.length || 1} value={done} /></div>
        </div>
        {late && <p className="message error small" style={{ marginBottom: 0 }}>This shift ended at {time(cl.ends_at)} and the checklist is not signed. Your Program Coordinator and Program Manager have been told.</p>}
      </section>

      {SECTIONS.map((sec) => {
        const items = all.filter((t) => (sec.key === 'Shift' ? !['Start', 'End'].includes(t.section) : t.section === sec.key));
        if (!items.length) return null;
        const groups = sec.key === 'Shift' ? [...new Set(items.map((t) => (t.area === 'Cleaning' ? 'Cleaning' : 'Duties')))] : ['All'];
        return (
          <section key={sec.key} className="card">
            <h2 style={{ marginTop: 0 }}>{sec.key === 'Shift' ? `${SHIFTS[cl.shift]?.icon} ${SHIFTS[cl.shift]?.label} duties` : sec.label} <span className="muted small">{items.filter((t) => t.status).length}/{items.length}{sec.hint ? ` · ${sec.hint}` : ''}</span></h2>
            {groups.map((g) => (
              <div key={g}>
                {g === 'Cleaning' && <h3 className="cl-sub">🧽 Cleaning for this shift</h3>}
                <ul className="cl-list">
                  {items.filter((t) => g === 'All' || (g === 'Cleaning') === (t.area === 'Cleaning')).map((t) => (
                    <ChecklistItem key={t.id} t={t} locked={locked} icon={AREAS[t.area] ?? '•'} />
                  ))}
                </ul>
                {g !== 'Cleaning' && sec.key === 'Shift' && cl.shift === 'Night' && (
                  <div id="bedchecks" className="cl-bed">
                    <strong>🛏 Bed checks: {(cl.bed_checks ?? []).length} of about {need}</strong> <span className="muted small">(every {cl.homes?.bed_check_minutes ?? 30} min unless a care plan says otherwise)</span>
                    {(cl.bed_checks ?? []).length > 0 && <div className="small muted">{cl.bed_checks.map((b) => time(b)).join(' · ')}</div>}
                    {!locked && <form action={logBedCheck}><input type="hidden" name="id" value={cl.id} /><button className="secondary">＋ Log a bed check now</button></form>}
                  </div>
                )}
              </div>
            ))}
            {sec.key === 'End' && notes && (
              <p className="small" style={{ marginTop: 8 }}>
                📝 Daily notes this shift: <strong>{notes.done} of {notes.total}</strong> signed{notes.missing.length ? ` — still to do: ${notes.missing.join(', ')}` : ' ✓'} · <Link href="/notes">Open daily notes →</Link>
              </p>
            )}
          </section>
        );
      })}

      <section className="card" id="sign">
        <h2 style={{ marginTop: 0 }}>✍️ Sign off</h2>
        {cl.status === 'Signed' ? (
          <div>
            <p>Signed by <strong>{cl.profiles?.full_name}</strong> ({cl.initials}) on {fmtDateTime(cl.signed_at)}.</p>
            {cl.signature_image && <img src={cl.signature_image} alt="Signature" style={{ maxHeight: 60, background: '#fff' }} />}
          </div>
        ) : !mine ? <p className="muted">Not signed yet.</p> : (
          <form action={signChecklist} className="row sticky-actions" style={{ alignItems: 'flex-end', gap: 8 }}>
            <input type="hidden" name="id" value={cl.id} />
            <label>Your initials<input name="initials" required maxLength={6} placeholder="e.g. SW" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} style={{ width: 110, textTransform: 'uppercase' }} /></label>
            <button disabled={left > 0}>{left > 0 ? `${left} item${left > 1 ? 's' : ''} left` : 'I completed these duties — sign'}</button>
            <p className="muted small" style={{ flexBasis: '100%', margin: 0 }}>Your saved onboarding signature, name, date and time are added. After signing, the checklist is locked.</p>
          </form>
        )}
      </section>
      <History history={history} />
    </main>
  );
}

function History({ history }) {
  if (!history?.length) return null;
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>My recent shifts</h2>
      <ul className="list compact">{history.map((h) => <li key={h.id}><Link href={`/checklist?id=${h.id}`}>{SHIFTS[h.shift]?.icon} {h.shift} · {fmtDate(h.shift_date)} · {h.homes?.name}</Link><span className={`badge ${h.status === 'Signed' ? '' : 'warn'}`}>{h.status === 'Signed' ? '✓ Signed' : 'Open'}</span></li>)}</ul>
    </section>
  );
}
