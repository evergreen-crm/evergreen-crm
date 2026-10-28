// Staff file records: performance evaluations, supervision, job description on file (MCFD standards G.1.9, G.1.10(a), G.4.3, G.4.5).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { fmtDate, todayISO } from '@/lib/options';
import { staffFileGaps, EVALUATION_EVERY_MONTHS, SUPERVISION_EVERY_MONTHS } from '@/lib/mcfdStaffFile';
import { addMonthsISO } from '@/lib/onboarding';
import { levelOf } from '@/lib/levels';
import { addStaffRecord } from './actions';

export const dynamic = 'force-dynamic';

const KIND_LABEL = {
  performance_evaluation: 'Performance evaluation',
  supervision: 'Supervision',
  job_description_acknowledged: 'Job description signed',
};

export default async function StaffRecords({ params }) {
  const { id } = await params;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: person } = await supabase.from('profiles').select('id, full_name, role, level').eq('id', id).maybeSingle();
  if (!person) notFound();
  const { data: details } = await supabase.from('staff_details')
    .select('last_day, employment_status, exit_interview_on, rehire_eligible').eq('profile_id', id).maybeSingle();
  const { data: records } = await supabase.from('staff_file_records')
    .select('*').eq('profile_id', id).order('record_on', { ascending: false });

  const today = todayISO();
  const gaps = staffFileGaps(records ?? [], details, today);
  const canWrite = profile.role === 'admin' || levelOf(profile) >= 3;
  const sorted = (records ?? []);
  const next = (kind) => sorted.filter((r) => r.kind === kind).map((r) => r.next_due_on).filter(Boolean).sort().pop();

  return (
    <main>
      <p className="small"><Link href={`/hr/${id}`}>← {person.full_name}</Link></p>
      <h1>Staff file records</h1>
      <p className="muted small">Standards G.1.9, G.1.10(a), G.4.3 and G.4.5. Evaluations are due every {EVALUATION_EVERY_MONTHS} months and supervision every {SUPERVISION_EVERY_MONTHS} months (Evergreen defaults, to be confirmed).</p>

      <h2>Still to do ({gaps.length})</h2>
      {gaps.length === 0 && <p className="muted small">Nothing missing from the standards checks.</p>}
      {gaps.length > 0 && <ul>{gaps.map((g) => <li key={g}>{g}</li>)}</ul>}

      <h2>Records on file</h2>
      {sorted.length === 0 && <p className="muted small">No records yet.</p>}
      {sorted.length > 0 && (
        <table className="small">
          <thead><tr><th>Date</th><th>Type</th><th>Summary</th><th>Rating</th><th>Next due</th></tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.record_on)}</td>
                <td>{KIND_LABEL[r.kind]}</td>
                <td>{r.summary}</td>
                <td>{r.rating ?? '—'}</td>
                <td>{r.next_due_on ? fmtDate(r.next_due_on) : (r.kind === 'performance_evaluation' ? fmtDate(addMonthsISO(r.record_on, EVALUATION_EVERY_MONTHS)) : r.kind === 'supervision' ? fmtDate(addMonthsISO(r.record_on, SUPERVISION_EVERY_MONTHS)) : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">Next performance evaluation: {next('performance_evaluation') ? fmtDate(next('performance_evaluation')) : 'none set'}</p>

      {canWrite && (
        <>
          <h2>Add a record</h2>
          <form action={addStaffRecord} className="card stack">
            <input type="hidden" name="profile_id" value={id} />
            <label>Type
              <select name="kind" required defaultValue="performance_evaluation">
                <option value="performance_evaluation">Performance evaluation</option>
                <option value="supervision">Supervision</option>
                <option value="job_description_acknowledged">Job description signed</option>
              </select>
            </label>
            <label>Date<input type="date" name="record_on" required defaultValue={today} /></label>
            <label>Summary (what was reviewed, discussed, or agreed)<textarea name="summary" rows={3} required /></label>
            <label>Rating (evaluations only)
              <select name="rating" defaultValue="">
                <option value="">—</option>
                <option>Meets expectations</option>
                <option>Exceeds expectations</option>
                <option>Needs improvement</option>
                <option>Not rated</option>
              </select>
            </label>
            <label>Next due (optional)<input type="date" name="next_due_on" /></label>
            <button>Save record</button>
          </form>
        </>
      )}
    </main>
  );
}
