// HR: Jobs & applications (plan B5). Postings with their applications; create a new posting.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canSeeJobs, canEditJobs } from '@/lib/jobsAccess';
import { fmtDate } from '@/lib/options';
import { OPEN_STATUSES, wageText } from '@/lib/jobs';
import { POSITIONS } from '@/lib/prescreen';
import PostingForm from './PostingForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Jobs & applications · Evergreen' };

export default async function HrJobs({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!canSeeJobs(profile)) redirect('/');
  const edit = canEditJobs(profile);
  const [{ data: postings, error }, { data: apps }, { data: pos }] = await Promise.all([
    supabase.from('job_postings').select('*').order('created_at', { ascending: false }),
    supabase.from('job_applications').select('id, posting_id, status, first_name, last_name, submitted_at, flags').order('submitted_at', { ascending: false }),
    supabase.rpc('pay_positions'),
  ]);
  const positions = (pos ?? []).length ? pos.map((x) => (typeof x === 'string' ? x : x.position ?? x.pay_positions)).filter(Boolean) : POSITIONS;
  const byPosting = {};
  for (const a of apps ?? []) (byPosting[a.posting_id] ??= []).push(a);
  const newOnes = (apps ?? []).filter((a) => a.status === 'New');

  return (
    <main>
      <h1>💼 Jobs &amp; applications</h1>
      <p className="muted">Job postings for the public <Link href="/jobs">Careers page</Link> and the applications that come in. HR creates, publishes and closes postings and reviews applications; the Administrator can do the same, and the CEO can read. Applications that don’t lead to a hire are deleted 1 year after the decision.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}
      {error && <p className="message">Could not load postings: {error.message}</p>}

      {newOnes.length > 0 && (
        <section className="card" style={{ borderLeft: '4px solid #0b5a34' }}>
          <h2 style={{ marginTop: 0 }}>📥 {newOnes.length} new application{newOnes.length === 1 ? '' : 's'}</h2>
          <ul>{newOnes.slice(0, 10).map((a) => (
            <li key={a.id}><Link href={`/hr/jobs/application/${a.id}`}>{a.first_name} {a.last_name}</Link> · {(postings ?? []).find((p) => p.id === a.posting_id)?.title} · {fmtDate(a.submitted_at?.slice(0, 10))}{a.flags?.length ? <span className="badge warn"> {a.flags.length} to check</span> : null}</li>))}
          </ul>
        </section>
      )}

      <table>
        <thead><tr><th>Job</th><th>Status</th><th>Wage</th><th>Closes</th><th>Applications</th></tr></thead>
        <tbody>{(postings ?? []).map((p) => {
          const list = byPosting[p.id] ?? [];
          const sent = list.filter((a) => a.status !== 'Draft');
          return (
            <tr key={p.id}>
              <td><Link href={`/hr/jobs/${p.id}`}><strong>{p.title}</strong></Link><div className="muted small">{p.job_id} · {p.program} · {p.employment_type}{p.shift_team ? ` · ${p.shift_team}` : ''}</div></td>
              <td><span className={`badge${p.status === 'Open' ? '' : ' warn'}`}>{p.status}</span></td>
              <td className="small">{wageText(p) ?? <span className="bad-text">No wage yet</span>}</td>
              <td className="small">{p.closing_date ? fmtDate(p.closing_date) : 'Until filled'}</td>
              <td className="small">{sent.length} sent · {sent.filter((a) => OPEN_STATUSES.includes(a.status)).length} in progress{sent.some((a) => a.status === 'Hired') ? ' · hired ✓' : ''}</td>
            </tr>);
        })}
          {(postings ?? []).length === 0 && <tr><td colSpan={5} className="muted">No postings yet.</td></tr>}
        </tbody>
      </table>

      {edit && (
        <details className="card" id="new" open={(postings ?? []).length === 0 || undefined}>
          <summary><strong>+ New job posting</strong></summary>
          <p className="muted small">It starts as a draft. A Job ID (ECC-JOB-YYYY-NNN) is made automatically. Publish it when it’s ready.</p>
          <PostingForm positions={positions} />
        </details>
      )}
    </main>
  );
}
