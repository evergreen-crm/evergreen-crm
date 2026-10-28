'use client';
// Clock in / Check in / Clock out with the phone's location (only at the moment a button is tapped).
// Clock in and clock out only work at the house. "Before you leave" opens 30 minutes before the shift ends:
// checklist signed, notes signed and the safety lines answered — otherwise ask the Program Coordinator / Manager.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { recordShiftEvent, clockInSafe, clockOutSafe, askShiftPermission, setLateReason } from '@/app/id/actions';
import { getLocation, fmtDist } from '@/lib/getLocation';
import { TZ } from '@/lib/options';

const time = (ts) => (ts ? new Date(ts).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '');

function AskPermission({ kind, homeId, reasons, loc, onSent }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function send() {
    setBusy(true); setErr(null);
    const r = await askShiftPermission({ kind, homeId, reasons, note, loc });
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    onSent();
  }
  return (
    <div className="card ask-perm">
      <p><strong>Ask permission to {kind.toLowerCase()}</strong></p>
      {reasons?.length > 0 && <ul className="small">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      <label>Why? (your Program Coordinator / Manager reads this)
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. At the hospital with Jay · Feeling sick, Pat is covering" />
      </label>
      <button type="button" disabled={busy || !note.trim()} onClick={send}>{busy ? 'Sending…' : '🙋 Send request'}</button>
      {err && <p className="message error small">{err}</p>}
      <p className="muted small">You’ll get an alert when they answer. If anyone is in danger, use the 🆘 button or call 911 first.</p>
    </div>
  );
}

function BeforeYouLeave({ status, houseName, staffOnShift }) {
  const router = useRouter();
  const [a, setA] = useState({ headcount: false, handover_to: '', handover_on_call: '', hurt: '', hurt_details: '', safe_home: false });
  const [noRelief, setNoRelief] = useState(!(status.relief ?? []).length);
  const [brk, setBrk] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [asking, setAsking] = useState(null);
  const [sent, setSent] = useState(status.pending);
  const set = (p) => setA((x) => ({ ...x, ...p }));
  const notesOk = status.notes_done >= status.notes_total;
  const items = [
    { ok: status.window_open, text: status.window_open ? 'Last 30 minutes of your shift' : `Opens at ${time(status.opens_at)} (30 min before the shift ends at ${time(status.ends_at)})` },
    ...(status.has_checklist ? [{ ok: status.checklist_signed, text: status.checklist_signed ? 'Shift checklist signed' : 'Shift checklist not signed yet', href: status.checklist_id ? `/checklist?id=${status.checklist_id}` : '/checklist' }] : []),
    { ok: notesOk, text: notesOk ? `Daily notes signed (${status.notes_done}/${status.notes_total})` : `Daily notes still to sign: ${(status.notes_missing ?? []).join(', ')}`, href: '/notes' },
    { ok: (status.relief ?? []).length > 0, text: (status.relief ?? []).length ? `On shift with you now: ${status.relief.map((r) => r.name).join(', ')}` : 'Nobody from the next shift has clocked in yet — don’t leave until relieved, or get on-call’s OK' },
  ];

  async function go() {
    setBusy(true); setRes(null); setAsking(null);
    const { loc, why } = await getLocation();
    const answers = { ...a, handover_to: noRelief ? '' : a.handover_to, handover_on_call: noRelief ? a.handover_on_call : '' };
    const r = await clockOutSafe({ loc, answers, breakMinutes: brk, note });
    setBusy(false);
    if (r?.error) { setRes({ bad: true, text: r.error }); return; }
    if (r?.ok) { setRes({ bad: !r.clean, text: r.clean ? '✓ Clocked out. Thank you — get home safe.' : '✓ Clocked out with your manager’s OK.' }); router.refresh(); return; }
    if (r?.need) {
      const reasons = (r.missing ?? []).map((x) => (x === 'not at the house' ? `Not at ${houseName ?? 'the house'} (${fmtDist(r.distance_m)} away)` : x === 'no location' ? why ?? 'No location from the phone' : x));
      setAsking({ reasons, loc });
    }
  }

  return (
    <div className="before-leave">
      <h3 style={{ margin: '4px 0 8px' }}>🛡 Before you leave</h3>
      <ul className="bl-checks">
        {items.map((i) => <li key={i.text} className={i.ok ? 'ok' : 'no'}><span>{i.ok ? '✓' : '⚠'}</span> {i.href && !i.ok ? <Link href={i.href}>{i.text} →</Link> : i.text}</li>)}
      </ul>
      <div className="bl-q">
        <label className="check"><input type="checkbox" checked={a.headcount} onChange={(e) => set({ headcount: e.target.checked })} /> ⭐ Everyone is accounted for right now</label>
        {!noRelief ? (
          <label>⭐ I gave a verbal handover to
            <select value={a.handover_to} onChange={(e) => set({ handover_to: e.target.value })}>
              <option value="">Choose…</option>
              {(status.relief ?? []).map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              {(staffOnShift ?? []).filter((n) => !(status.relief ?? []).some((r) => r.name === n)).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        ) : (
          <label>⭐ Nobody came yet — the on-call person who said I can leave
            <input value={a.handover_on_call} onChange={(e) => set({ handover_on_call: e.target.value })} placeholder="Name of on-call manager" />
          </label>
        )}
        <button type="button" className="link small" onClick={() => setNoRelief(!noRelief)}>{noRelief ? 'My relief is here — choose them' : 'My relief hasn’t arrived'}</button>
        <fieldset className="bl-hurt">
          <legend>Were you hurt, or did you have a close call this shift?</legend>
          <label className="check"><input type="radio" name="hurt" checked={a.hurt === 'no'} onChange={() => set({ hurt: 'no' })} /> No</label>
          <label className="check"><input type="radio" name="hurt" checked={a.hurt === 'yes'} onChange={() => set({ hurt: 'yes' })} /> Yes</label>
          {a.hurt === 'yes' && <label>What happened?<input value={a.hurt_details} onChange={(e) => set({ hurt_details: e.target.value })} placeholder="Briefly — your manager will follow up (WorkSafeBC)" /></label>}
        </fieldset>
        <label className="check"><input type="checkbox" checked={a.safe_home} onChange={(e) => set({ safe_home: e.target.checked })} /> I’m OK to get home safely (fit to drive, or I have a ride)</label>
        <div className="row">
          <label>Unpaid break (minutes)<input type="number" inputMode="numeric" min="0" value={brk} onChange={(e) => setBrk(e.target.value)} /></label>
          <label>Note (needed if you stayed more than 15 min past the end)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Stayed with a youth in crisis, PM OK'd" /></label>
        </div>
      </div>
      <div className="row sticky-actions">
        <button type="button" className="big stop" disabled={busy} onClick={go}>{busy ? 'Checking location…' : '■ Clock out'}</button>
      </div>
      {res && <p className={`message ${res.bad ? '' : 'ok'}`}>{res.text}</p>}
      <p className="small"><Link href="/absence">🤒 I’m sick / can’t make my shift</Link> · <Link href="/absence">⏰ Running late</Link></p>
      {sent && !asking && <p className="message small">🙋 Your request is waiting for your Program Coordinator / Manager. You’ll get an alert, then tap Clock out again.</p>}
      {asking && <AskPermission kind="Clock out" reasons={asking.reasons} loc={asking.loc} onSent={() => { setAsking(null); setSent(true); router.refresh(); }} />}
    </div>
  );
}

function LateReason({ entry, minutes, onDone }) {
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function save() {
    setBusy(true); setErr(null);
    const r = await setLateReason({ entry, reason: why });
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    onDone();
  }
  return (
    <div className="card ask-perm">
      <p style={{ margin: '0 0 6px' }}><strong>You clocked in {minutes} minutes after your shift started.</strong> What happened?</p>
      <div className="row">
        <input value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Bus was late, I texted on-call" />
        <button type="button" disabled={busy || !why.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {err && <p className="message error small">{err}</p>}
      <p className="muted small" style={{ marginBottom: 0 }}>Your Program Coordinator sees this. Next time, tap ⏰ Running late before the shift starts.</p>
    </div>
  );
}

export default function CheckInPanel({ onShift, homes, defaultHome, houseName, status, staffOnShift, nextShift }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [asking, setAsking] = useState(null);
  const [late, setLate] = useState(null);
  const [home, setHome] = useState(nextShift?.home_id ?? defaultHome ?? '');
  const router = useRouter();
  useEffect(() => { setAsking(null); }, [onShift]);

  async function clockIn() {
    setBusy('in'); setMsg(null); setAsking(null);
    const { loc, why } = await getLocation();
    const r = await clockInSafe({ homeId: home, loc });
    setBusy(null);
    if (r?.error) { setMsg({ bad: true, text: r.error }); return; }
    if (r?.need) {
      const name = homes.find((h) => h.id === home)?.name ?? 'the house';
      setAsking({ reasons: [loc ? `Not at ${name} (${fmtDist(r.distance_m)} away)` : why], loc });
      return;
    }
    setMsg({ bad: false, text: `Clocked in${r.shift ? ` for ${r.shift}` : ''}${r.on_site ? ' at the house ✓' : r.approved ? ' with your manager’s OK' : !r.home_set ? ' — the house location isn’t set yet, please tell your Program Coordinator' : ''}.${r.unscheduled ? ' (No scheduled shift found — your Program Coordinator was told.)' : ''}` });
    if (r.late) setLate({ entry: r.entry, minutes: r.late });
    router.refresh();
  }

  async function checkIn() {
    setBusy('check'); setMsg(null);
    const { loc } = await getLocation();
    const r = await recordShiftEvent({ kind: 'Check-in', loc });
    setBusy(null);
    if (r?.error) { setMsg({ bad: true, text: r.error }); return; }
    setMsg({ bad: r.onSite === false, text: `Check-in recorded. ${r.onSite === true ? `✓ At ${houseName ?? 'the house'}` : r.onSite === false ? `⚠ ${fmtDist(r.distance)} from the house` : loc ? 'Location saved' : 'Saved without location'}.` });
    router.refresh();
  }

  return (
    <div className="checkin">
      {!onShift ? (
        <div>
          <label>House
            <select value={home} onChange={(e) => setHome(e.target.value)}>
              <option value="">—</option>
              {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          {nextShift && <p className="small" style={{ margin: '6px 0' }}>🗓 <strong>Your shift: {nextShift.text}</strong>{nextShift.from ? <span className="muted"> · clock in from {nextShift.from}</span> : null}</p>}
          <button type="button" className="big go" disabled={!!busy || !home} onClick={clockIn}>{busy ? 'Checking location…' : '▶ Clock in'}</button>
          <p className="muted small">You can clock in only at the house, up to 15 minutes before your shift. Away from the house (for example at the hospital with a youth)? You’ll be asked for a reason, and your manager approves it.</p>
          <p className="small"><Link href="/absence">🤒 I’m sick / can’t make my shift</Link> · <Link href="/absence">⏰ Running late</Link></p>
          {asking && <AskPermission kind="Clock in" homeId={home} reasons={asking.reasons} loc={asking.loc} onSent={() => { setAsking(null); setMsg({ bad: false, text: '🙋 Request sent. You’ll get an alert when it’s approved — then tap Clock in again.' }); }} />}
        </div>
      ) : (
        <>
          <button type="button" className="big go" disabled={!!busy} onClick={checkIn}>{busy === 'check' ? 'Getting location…' : '📍 Check in now'}</button>
          {status?.on_shift && <BeforeYouLeave status={status} houseName={houseName} staffOnShift={staffOnShift} />}
          {!status?.on_shift && <p className="muted small">The “Before you leave” check isn’t switched on yet. Please tell the office (setup file: safe-shifts.sql).</p>}
        </>
      )}
      {msg && <p className={`message ${msg.bad ? '' : 'ok'}`}>{msg.text}</p>}
      {late && <LateReason entry={late.entry} minutes={late.minutes} onDone={() => { setLate(null); setMsg({ bad: false, text: 'Thanks — your reason was saved.' }); }} />}
    </div>
  );
}
