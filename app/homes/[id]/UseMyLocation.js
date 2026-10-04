'use client';
// Fills the house latitude / longitude from this phone or computer. Best done while standing at the house.
import { useState } from 'react';

export default function UseMyLocation() {
  const [msg, setMsg] = useState(null);
  function go(e) {
    const form = e.currentTarget.form;
    if (!navigator.geolocation) { setMsg('Location is not available in this browser.'); return; }
    setMsg('Getting location…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        form.elements.lat.value = p.coords.latitude.toFixed(6);
        form.elements.lng.value = p.coords.longitude.toFixed(6);
        setMsg(`Done (accuracy ± ${Math.round(p.coords.accuracy)} m). Press Save.`);
      },
      () => setMsg('Could not get location. Allow location for this site, or type the numbers from Google Maps.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  return (
    <span>
      <button type="button" className="secondary" onClick={go}>📍 Use my current location</button>
      {msg && <span className="small"> {msg}</span>}
    </span>
  );
}
