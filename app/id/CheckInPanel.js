'use client';
// Clock in / Check in / Clock out with the phone's location (only at the moment the button is tapped).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { recordShiftEvent } from '@/app/id/actions';

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ loc: null, why: 'This phone or browser cannot share location.' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ loc: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy } }),
      (e) => resolve({ loc: null, why: e.code === 1 ? 'Location is blocked. Allow location for this site in your phone settings.' : 'Could not get your location.' }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

const fmtDist = (m) => (m == null ? null : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

export default function CheckInPanel({ onShift, homes, defaultHome, houseName }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [noLoc, setNoLoc] = useState(null);   // kind waiting for "send without location"
  const router = useRouter();

  async function run(kind, form, allowNoLocation = false) {
    setBusy(kind); setMsg(null);
    const { loc, why } = await getLocation();
    if (!loc && !allowNoLocation) { setBusy(null); setNoLoc({ kind, form, why }); return; }
    setNoLoc(null);
    const res = await recordShiftEvent({
      kind, loc, homeId: form?.home_id, note: form?.note, breakMinutes: form?.break_minutes,
    });
    setBusy(null);
    if (res?.error) { setMsg({ bad: true, text: res.error }); return; }
    const where = res.onSite === true ? `✓ At ${houseName ?? 'the house'}`
      : res.onSite === false ? `⚠ ${fmtDist(res.distance)} from the house`
      : loc ? 'Location saved' : 'Saved without location';
    setMsg({ bad: res.onSite === false, text: `${kind} recorded. ${where}.` });
    router.refresh();
  }

  const read = (e) => Object.fromEntries(new FormData(e.currentTarget.form ?? e.currentTarget));

  return (
    <div className="checkin">
      {!onShift ? (
        <form onSubmit={(e) => { e.preventDefault(); run('Clock in', read(e)); }}>
          <label>House
            <select name="home_id" defaultValue={defaultHome ?? ''}>
              <option value="">—</option>
              {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <button className="big go" disabled={!!busy}>{busy ? 'Getting location…' : '▶ Clock in'}</button>
        </form>
      ) : (
        <>
          <button className="big go" disabled={!!busy} onClick={() => run('Check-in', null)}>{busy === 'Check-in' ? 'Getting location…' : '📍 Check in now'}</button>
          <details className="clockout">
            <summary>Clock out</summary>
            <form onSubmit={(e) => { e.preventDefault(); run('Clock out', read(e)); }}>
              <div className="row">
                <label>Unpaid break (minutes)<input type="number" min="0" name="break_minutes" defaultValue="0" /></label>
                <label>Notes<input name="note" /></label>
              </div>
              <button className="big stop" disabled={!!busy}>{busy === 'Clock out' ? 'Getting location…' : '■ Clock out'}</button>
            </form>
          </details>
        </>
      )}
      {noLoc && (
        <div className="message">
          <p>{noLoc.why}</p>
          <button className="secondary" onClick={() => run(noLoc.kind, noLoc.form, true)}>Record {noLoc.kind.toLowerCase()} without location</button>
          <p className="muted small">Your manager will see that no location was shared.</p>
        </div>
      )}
      {msg && <p className={`message ${msg.bad ? '' : 'ok'}`}>{msg.text}</p>}
    </div>
  );
}
