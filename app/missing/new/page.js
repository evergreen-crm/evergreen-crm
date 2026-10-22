// 🔎 Report someone missing: a short form, then the timed log starts.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { todayISO, nowTime } from '@/lib/options';
import { plainError } from '@/lib/plain';
import { startMissing } from '../actions';

export default async function NewMissing({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  let q = supabase.from('residents').select('id, first_name, last_name, preferred_name, home_id, homes(name)').eq('status', 'active').order('first_name');
  if (profile.role === 'staff' && profile.home_id) q = q.eq('home_id', profile.home_id);
  const { data: people } = await q;

  return (
    <main>
      <p className="small"><Link href="/missing">← Missing</Link></p>
      <h1>🔎 Report someone missing</h1>
      {sp?.error && <p className="message error">{plainError(sp.error)}</p>}
      <div className="message error" style={{ marginBottom: 12 }}>
        <strong>Higher risk or in danger? Call 911 first, then fill this in.</strong> Don’t wait: keep searching while a co-worker fills this in if you can.
      </div>
      <form action={startMissing} className="card">
        <label>Who is missing? ⭐
          <select name="resident_id" required defaultValue={sp?.resident ?? ''}>
            <option value="" disabled>Choose…</option>
            {(people ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.preferred_name || p.first_name} {p.last_name}{profile.role !== 'staff' && p.homes?.name ? ` · ${p.homes.name}` : ''}</option>
            ))}
          </select>
        </label>
        <div className="row">
          <label>Last seen — date<input type="date" name="seen_date" defaultValue={todayISO()} /></label>
          <label>Time<input type="time" name="seen_time" defaultValue={nowTime()} /></label>
        </div>
        <label>Where were they last seen?<input name="where" placeholder="For example: front yard, leaving for school, bus stop on Main St" /></label>
        <label>Who were they with?<input name="with" placeholder="Alone, or names" /></label>
        <label>What were they wearing?<input name="clothing" placeholder="Colours, jacket, shoes, bag" /></label>
        <label className="check"><input type="checkbox" name="higher_risk" /> <strong>Higher risk</strong> (young, mental health or support needs, suicide risk, medical needs, drugs or alcohol, exploitation or gang concern, late at night or cold)</label>
        <label>Why higher risk? (optional)<input name="risk_notes" /></label>
        <button className="miss-go">🔎 Start the missing log and alert leaders</button>
        <p className="muted small">This alerts the Program Coordinator and Program Manager right away, opens a critical incident, and starts the timer. At 30 minutes, 1 hour and 2 hours the CRM reminds leaders if steps are missing.</p>
      </form>
    </main>
  );
}
