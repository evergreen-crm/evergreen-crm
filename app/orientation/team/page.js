// Team orientation: staff in orientation that I can sign off (PC for their houses; PM, HR, directors, Admin).
import Link from 'next/link';
import { requireUser } from '@/lib/auth';

export default async function TeamOrientation() {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data: rows } = await supabase.rpc('orientation_team');
  return (
    <main>
      <div className="div-banner academy">
        <span className="div-icon">🧭</span>
        <div><h1>Team orientation</h1><p>New staff in their 6-day orientation · open a person to sign off their steps</p></div>
      </div>
      {!(rows ?? []).length ? <p className="muted">No one you sign off is in orientation right now.</p> : (
        <table>
          <thead><tr><th>Staff member</th><th>House</th><th>Progress</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.profile_id}>
              <td>{r.full_name}</td><td>{r.home_name ?? '—'}</td>
              <td>{r.complete ? <span className="badge">🎓 Complete</span> : `Day ${r.day} · ${r.done ?? 0}/${r.total ?? 0} steps`}</td>
              <td><Link href={`/orientation?p=${r.profile_id}`}>Open →</Link></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </main>
  );
}
