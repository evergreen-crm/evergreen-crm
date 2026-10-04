'use client';
import { useState } from 'react';
import { importOne } from './actions';

export default function ImportRunner({ items }) {
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  async function run() {
    setBusy(true); setLog([]); setDone(0);
    for (let i = 0; i < items.length; i++) {
      let res;
      try { res = await importOne(i); } catch (e) { res = { error: e.message }; }
      setLog((l) => [...l, { i, ...res }]);
      setDone(i + 1);
    }
    setBusy(false);
  }
  const pct = Math.round((100 * done) / items.length);
  return (
    <div className="card">
      <button onClick={run} disabled={busy}>{busy ? `Importing… ${done} of ${items.length}` : `Import all ${items.length} manuals`}</button>
      <div className="progress"><span style={{ width: `${pct}%` }} /></div>
      <ul className="small">
        {log.map((r) => (
          <li key={r.i}>{r.error ? '✗ ' : r.skipped ? '• ' : '✓ '}{items[r.i].title} — {r.error ?? r.message}</li>
        ))}
      </ul>
      {!busy && done === items.length && done > 0 && <p className="message ok">Finished. Open <a href="/policies">Policies</a> to see them.</p>}
    </div>
  );
}
