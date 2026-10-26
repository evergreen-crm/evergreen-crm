// 📞 Can't make my shift · ⏰ Running late — for every staff member, on any device.
// Calling in opens the shift straight away and tells the house's Program Coordinator and Program Manager.
// Under 4 hours' notice: also phone the on-call supervisor (Handbook §23). Sick calls never count against the badge.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { fmtDate, todayISO, addDaysISO } from '@/lib/options';
import { plainError } from '@/lib/plain';
import { shiftTimes, hoursUntil, clock, ABSENCE_KINDS, ABSENCE_TONE } from '@/lib/attendance';
import { cantMakeShift, runningLate } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Can’t make my shift · Evergreen' };

const tel = (p) => `tel:${String(p).replace(/[^\d+]/g, '')}`;

export default async function Absence({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const today = todayISO();
  const yearStart = today.slice(0, 4) + '-01-01';
  const [{ data: shifts }, { data: entries }, { data: mine, error }, { data: myHome }] = await Promise.all([
    supabase.from('shifts').select('id, shift_date, start_time, end_time, label, home_id, homes(name, on_call_phone)')
      .eq('profile_id', user.id).gte('shift_date', addDaysISO(today, -1)).lte('shift_date', addDaysISO(today, 14)).order('shift_date').order('start_time'),
    supabase.from('time_entries').select('shift_id').eq('profile_id', user.id).not('shift_id', 'is', null).gte('clock_in', addDaysISO(today, -2)),
    supabase.from('shift_absences').select('id, shift_date, shift_label, kind, status, hours_notice, eta_minutes, reported_at, decision_note, homes:home_id(name)')
      .eq('profile_id', user.id).gte('shift_date', yearStart).order('shift_date', { ascending: false }),
    profile.home_id ? supabase.from('homes').select('name, on_call_phone').eq('id', profile.home_id).maybeSingle() : { data: null },
  ]);
  const notReady = error && /relation|schema|column/i.test(error.message);
  const clockedIn = new Set((entries ?? []).map((e) => e.shift_id));
  const upcoming = (shifts ?? []).map((s) => ({ ...s, ...shiftTimes(s) })).filter((s) => s.end > new Date() && !clockedIn.has(s.id));
  // 🤒 Sick-day balances (BC paid / unpaid) are for directors and Payroll only (Melvin, Oct 26) — never shown here.
  const wantKind = ABSENCE_KINDS.includes(sp.kind) ? sp.kind : 'Sick';
  const wantPay = wantKind === 'Sick' && sp.pay !== 'other' ? 'BC paid sick' : 'Unpaid sick';
  const openFirst = !!sp.kind || !!sp.pay;
  const onCall = myHome?.on_call_phone;

  return (
    <main>
      <h1>{sp.kind === 'Sick' ? '🤒 Sick — can’t make my shift' : '📞 Can’t make my shift'}</h1>
      <p className="small">Sick, a family emergency, or running late? Tell us here. Your Program Coordinator and Program Manager get an alert right away, and the shift is offered to coworkers.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.call !== undefined && (
        <p className="message error"><strong>Your shift starts in less than 4 hours. Please also phone the on-call supervisor now</strong>
          {sp.call ? <>: <a href={tel(sp.call)} className="button" style={{ marginLeft: 6 }}>📞 {sp.call}</a></> : ' (ask your Program Coordinator for the number).'}</p>
      )}
      {sp.error && <p className="message error">{plainError(sp.error)}</p>}
      {notReady && <p className="message">This page isn’t switched on yet. Please phone your on-call supervisor{onCall ? ` (${onCall})` : ''}.</p>}
      <p className="small">🆘 If anyone is in danger, call 911. On-call for {myHome?.name ?? 'your house'}: {onCall ? <a href={tel(onCall)}>{onCall}</a> : 'ask your Program Coordinator'}.</p>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>My next shifts</h2>
        {!upcoming.length && <p className="muted">No shifts in the next 2 weeks. <Link href="/schedule">My schedule →</Link></p>}
        {upcoming.map((s, idx) => {
          const h = hoursUntil(s.start);
          const started = h <= 0;
          const soon = h < 4;
          return (
            <div key={s.id} className={`abs-shift ${soon ? 'soon' : ''}`}>
              <div className="title-row">
                <strong>{fmtDate(s.shift_date)} · {s.label ?? 'Shift'} {clock(s.start)}–{clock(s.end)}</strong>
                <span className="small muted">{s.homes?.name}{started ? ' · started' : h < 24 ? ` · in ${h < 1 ? Math.max(1, Math.round(h * 60)) + ' min' : Math.round(h) + ' h'}` : ''}</span>
              </div>
              {h <= 6 && (
                <details className="abs-form" open={started}>
                  <summary><strong>⏰ I’m running late</strong></summary>
                  <form action={runningLate} className="row" style={{ alignItems: 'end' }}>
                    <input type="hidden" name="shift_id" value={s.id} />
                    <label>About how late?<select name="minutes" defaultValue="15">{[10, 15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select></label>
                    <label>Note (optional)<input name="note" maxLength={300} placeholder="e.g. bus delayed" /></label>
                    <button>Send</button>
                  </form>
                </details>
              )}
              <details className="abs-form" open={openFirst && idx === 0}>
                <summary><strong>{wantKind === 'Sick' ? '🤒 I’m sick — I can’t make this shift' : '📞 I can’t make this shift'}</strong></summary>
                <form action={cantMakeShift}>
                  <input type="hidden" name="shift_id" value={s.id} />
                  <fieldset className="abs-kinds">
                    <legend className="small">Why? (no medical details needed)</legend>
                    {ABSENCE_KINDS.map((k, i) => <label key={k} className="check"><input type="radio" name="kind" value={k} required defaultChecked={k === wantKind} /> {k === 'Sick' ? '🤒 Sick' : k === 'Family emergency' ? '🏠 Family emergency' : '📝 Other'}</label>)}
                  </fieldset>
                  <fieldset className="abs-kinds abs-pay">
                    <legend className="small">What kind of day off?</legend>
                    <label className="check"><input type="radio" name="pay" value="BC paid sick" defaultChecked={wantPay === 'BC paid sick'} /> 🤒 Sick day</label>
                    <label className="check"><input type="radio" name="pay" value="Unpaid sick" defaultChecked={wantPay === 'Unpaid sick'} /> Unpaid day off</label>
                    <label className="check"><input type="radio" name="pay" value="Vacation" /> 🌴 Use vacation</label>
                    <label className="check"><input type="radio" name="pay" value="Banked time" /> 🏦 Use banked time</label>
                    <p className="small muted" style={{ margin: '4px 0 0' }}>“Sick day” is only for when you are sick. Payroll works out the pay.</p>
                  </fieldset>
                  <div className="row">
                    <label>Note for your Program Coordinator (optional)<input name="note" maxLength={300} placeholder="e.g. back on Thursday" /></label>
                    <label>Also off until (optional)<input type="date" name="until" min={s.shift_date} max={addDaysISO(s.shift_date, 14)} /></label>
                  </div>
                  {soon && <p className="small bad-text">This shift starts {started ? 'now' : 'in less than 4 hours'}: after you send this, also phone on-call{s.homes?.on_call_phone ? ` (${s.homes.on_call_phone})` : ''}.</p>}
                  <button className="danger-soft">Tell my Program Coordinator</button>
                </form>
              </details>
            </div>
          );
        })}
      </section>

      <section className="card" id="year">
        <h2 style={{ marginTop: 0 }}>My call-ins this year</h2>
        <div className="stats">
          <div className="stat"><strong>{(mine ?? []).filter((a) => a.status === 'Late arrival').length}</strong><span>late arrivals reported</span></div>
          <div className="stat"><strong>{(mine ?? []).filter((a) => a.status === 'No-show').length}</strong><span>no-shows</span></div>
        </div>
        <p className="muted small"><strong>Calling in sick never counts against your 🟢🟡🔴 badge.</strong> Late arrivals and confirmed no-shows do. Questions about sick pay? Ask Payroll.</p>
        {(mine ?? []).length > 0 && (
          <ul className="list compact">{(mine ?? []).map((a) => (
            <li key={a.id}><span>{fmtDate(a.shift_date)} · {a.shift_label ?? ''} · {a.homes?.name ?? ''} — {a.kind}{a.eta_minutes ? ` (~${a.eta_minutes} min)` : ''}{a.decision_note ? <span className="muted"> · {a.decision_note}</span> : null}</span>
              <span className={`badge ${ABSENCE_TONE[a.status] ?? ''}`}>{a.status}</span></li>
          ))}</ul>
        )}
      </section>
    </main>
  );
}
