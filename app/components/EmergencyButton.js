'use client';
// 🆘 Emergency: always one tap away for staff. Call 911 or on-call straight from the phone, and alert the
// house's Program Coordinator and Program Managers (with location) — then the first steps for that emergency.
import { useState } from 'react';
import Link from 'next/link';
import { raiseEmergency } from '@/app/id/actions';
import { getLocation } from '@/lib/getLocation';
import { EMERGENCIES, emergencyByKey } from '@/lib/emergency';

export default function EmergencyButton({ onCall, housePhone, homeName, homeId }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState(null); // 'sending' | 'sent' | {error}

  const close = () => { setOpen(false); setKind(null); setNote(''); setState(null); };
  async function send(k) {
    setKind(k); setState('sending');
    const { loc } = await getLocation();
    const r = await raiseEmergency({ kind: k, note, loc });
    setState(r?.error ? { error: r.error } : 'sent');
  }
  const e = kind ? emergencyByKey(kind) : null;

  return (
    <>
      <button type="button" className="sos-fab no-print" aria-label="Emergency" onClick={() => setOpen(true)}>🆘</button>
      {open && (
        <div className="sos-sheet no-print" role="dialog" aria-modal="true" aria-label="Emergency">
          <div className="sos-panel">
            <div className="rh-head"><h2 style={{ margin: 0 }}>🆘 Emergency</h2><button type="button" className="secondary" onClick={close}>Close</button></div>
            <div className="sos-calls">
              <a href="tel:911" className="button sos-911">📞 Call 911</a>
              {onCall ? <a href={`tel:${onCall}`} className="button secondary">📞 Call on-call</a> : <span className="muted small">On-call number not set for {homeName ?? 'your house'} — ask your Program Coordinator.</span>}
              {housePhone && <a href={`tel:${housePhone}`} className="button secondary">📞 House phone</a>}
            </div>
            {!kind ? (
              <>
                <p className="small"><strong>Alert my Program Coordinator and Managers now</strong> (sends your location):</p>
                <label>Anything they should know? (optional)<input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="e.g. Jay left at 9:40 pm, red hoodie" /></label>
                <div className="sos-kinds">
                  {EMERGENCIES.map((x) => <button type="button" key={x.key} className="sos-kind" onClick={() => send(x.key)}><span>{x.icon}</span>{x.label}</button>)}
                </div>
              </>
            ) : (
              <div>
                <p className={`message ${state?.error ? 'error' : 'ok'}`}>
                  {state === 'sending' ? 'Sending alert…' : state === 'sent' ? `✓ Alert sent: ${e.label}. Your leaders can see where you are.` : `Couldn’t send the alert: ${state?.error}. Call on-call now.`}
                </p>
                {e.call911 && <p><strong>If anyone is in danger, call 911 now.</strong></p>}
                <h3 style={{ margin: '10px 0 4px' }}>{e.icon} What to do</h3>
                <ol className="sos-steps">{e.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                <p className="small">When it’s safe: <Link href={homeId ? `/homes/${homeId}?tab=residents` : '/homes'} onClick={close}>write the incident report →</Link></p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
