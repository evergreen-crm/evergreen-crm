// Records to fix in this house: emergency information and the medication record, resident by resident.
import Link from 'next/link';
import { residentIssues } from '@/lib/recordChecks';

export default function RecordChecks({ homeId, program, residents, meds }) {
  const byRes = {};
  for (const m of meds ?? []) (byRes[m.resident_id] ??= []).push(m);
  const rows = (residents ?? [])
    .map((r) => ({ r, issues: residentIssues(r, byRes[r.id] ?? [], program) }))
    .filter((x) => x.issues.length);
  return (
    <>
      <h2>Records to fix ({rows.length} resident{rows.length === 1 ? '' : 's'})</h2>
      {rows.length === 0 && <p className="muted small">Emergency information and medication records are complete for every resident.</p>}
      {rows.length > 0 && (
        <table className="small">
          <thead><tr><th>Resident</th><th>What is missing</th></tr></thead>
          <tbody>
            {rows.map(({ r, issues }) => (
              <tr key={r.id}>
                <td><Link href={`/residents/${r.id}`}>{r.preferred_name || r.first_name} {r.last_name}</Link></td>
                <td><ul>{issues.map((i) => <li key={i}>{i}</li>)}</ul></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
