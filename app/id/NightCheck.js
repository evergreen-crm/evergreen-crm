'use client';
// "Night check" on the phone: shown only when a night check is due or coming up (supabase/night-checks.sql).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nightCheckIn } from '@/app/id/night-actions';
import { getLocation } from '@/lib/getLocation';
import { TZ } from '@/lib/options';

const time = (ts) => new Date(ts).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: TZ });

export default function NightCheck({ checks = [] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  // Keep the screen current while a check is due.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 60000);
    return () => clearInterval(t);
  }, [router]);

  if (!checks.length) return null;
  const due = checks.find((c) => c.status === 'Due');
  const next = checks.find((c) => c.status !== 'Due');

  async function tap() {
    setBusy(true); setErr(null); setMsg(null);
    const { loc, why } = await getLocation();
    if (why) { setBusy(false); setErr(why); return; }
    const r = await nightCheckIn({ loc });
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setMsg(r.on_site === false ? 'Saved.' : '✅ Night check saved. Thank you.');
    router.refresh();
  }

  return (
    <div className="card" id="night">
      <h3>🌙 Night check</h3>
      {due && (
        <>
          <p><strong>Check now.</strong> {due.kind === 'Random' ? 'Random check' : '2-hour check'}, due at {time(due.due_at)}.</p>
          <button type="button" disabled={busy} onClick={tap}>{busy ? 'Saving…' : 'Night check — I’m awake'}</button>
        </>
      )}
      {!due && next && <p className="muted small">Next check at {time(next.due_at)}.</p>}
      {msg && <p className="message ok small">{msg}</p>}
      {err && <p className="message error small">{err}</p>}
      <p className="muted small">Tap at the house. The check counts only inside the house area and within the time shown.</p>
    </div>
  );
}
