'use client';
// "Find from address": looks the house address up on OpenStreetMap and fills the map point (latitude / longitude).
import { useState } from 'react';
import { geocodeAddress } from '@/app/homes/actions';

export default function FindAddress() {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  async function go(e) {
    const form = e.currentTarget.form;
    const address = form.elements.address?.value?.trim();
    if (!address) { setMsg('Type the street address above first.'); return; }
    setBusy(true); setMsg('Looking up the address…');
    const r = await geocodeAddress(address);
    setBusy(false);
    if (r?.error) { setMsg(r.error); return; }
    form.elements.lat.value = r.lat.toFixed(6);
    form.elements.lng.value = r.lng.toFixed(6);
    setMsg(<>Found: {r.label}. <a href={`https://maps.google.com/?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer">Check the pin on the map</a>, then press Save.</>);
  }
  return (
    <span>
      <button type="button" className="secondary" disabled={busy} onClick={go}>🔎 Find from address</button>
      {msg && <span className="small"> {msg}</span>}
    </span>
  );
}
