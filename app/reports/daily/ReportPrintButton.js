'use client';
// Print / Save as PDF for the documentation report. Each print is saved in the printed-reports log first.
import { useState } from 'react';
import { logReportPrint } from './actions';

export default function ReportPrintButton({ info }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function go() {
    setBusy(true); setMsg(null);
    const res = await logReportPrint(info);
    setBusy(false);
    if (res?.error) { setMsg('Could not record this print, so it was stopped: ' + res.error); return; }
    window.print();
  }
  return (
    <>
      <button type="button" onClick={go} disabled={busy}>{busy ? 'Getting ready…' : '🖨 Print / Save as PDF'}</button>
      {msg && <span className="message error small">{msg}</span>}
    </>
  );
}
