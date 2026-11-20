// HR: one job posting (plan B5): edit, publish or close it, and its applications by status.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canSeeJobs, canEditJobs } from '@/lib/jobsAccess';
import { fmtDate } from '@/lib/options';
import { STATUSES, wageText } from '@/lib/jobs';
import { POSITIONS } from '@/lib/prescreen';
import PostingForm from '../PostingForm';
import { setPostingStatus } from '../actions';

export const dynamic = 'force-dynamic';

export default async function HrPosting({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!canSeeJobs(profile)) redirect('/');
  const edit = canEditJobs(profile);
  const [{ data: p }, { data: apps }, { data: pos }] = await Promise.all([
    supabase.from('job_postings').select('*, by:published_by(full_name)').eq('id', id).maybeSingle(),
    supabase.from('job_applications').select('id, status, first_name, last_name, email, submitted_at, flags, answers, application_no').eq('posting_id', id).order('submitted_at', { ascending: true }),
    supabase.rpc('pay_positions'),
  ]);
  if (!p) notFound();
  const positions = (pos ?? []).length ? pos.map((x) => (typeof x === 'string' ? x : x.position ?? x.pay_positions)).filter(Boolean) : POSITIONS;
  const filter = STATUSES.includes(sp.status) ? sp.status : null;
  const list = (apps ?? []).filter((a) => !filter || a.status === filter);
  const count = (s) => (apps ?? []).filter((a) => a.status === s).length;

  return (
    <main>
      <p><Link href="/hr/jobs">← Jobs &amp; applications</Link></p>
      <h1>{p.title}</h1>
      <p className="muted">Job ID <strong>{p.job_id}</strong> · <span className={`badge${p.status === 'Open' ? '' : ' warn'}`}>{p.status}</span>{p.published_at ? ` · published ${fmtDate(p.published_at.slice(0, 10))} by ${p.by?.full_name ?? '—'}` : ''}{p.status === 'Open' && <> · <Link href={`/jobs/${p.job_id}`}>See it on the Careers page</Link></>}</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}

      {edit && (
        <form action={setPostingStatus} className="row no-print">
          <input type="hidden" name="id" value={p.id} />
          {p.status !== 'Open' && <button name="status" value="Open">📢 Publish on the Careers page</button>}
          {p.status === 'Open' && <button name="status" value="Closed" className="secondary">Close the posting</button>}
          {p.status === 'Closed' && <button name="status" value="Draft" className="secondary">Back to draft</button>}
        </form>
      )}
      {!wageText(p) && <p className="message small">Add the wage range before publishing (B.C. pay transparency).</p>}

      <h2>Applications ({(apps ?? []).length})</h2>
      <p className="small">
        <Link href={`/hr/jobs/${id}`}>All</Link>{STATUSES.map((s) => count(s) ? <span key={s}> · <Link href={`/hr/jobs/${id}?status=${encodeURIComponent(s)}`}>{s} ({count(s)})</Link></span> : null)}
      </p>
      {list.length === 0 ? <p className="card muted">No applications{filter ? ` with status ${filter}` : ' yet'}.</p> : (
        <table>
          <thead><tr><th>Applicant</th><th>Sent</th><th>Status</th><th>Experience</th><th>To check</th></tr></thead>
          <tbody>{list.map((a) => (
            <tr key={a.id}>
              <td><Link href={`/hr/jobs/application/${a.id}`}>{a.first_name} {a.last_name}</Link><div className="muted small">{a.application_no ? `${a.application_no} · ` : ''}{a.email}</div></td>
              <td className="small">{a.submitted_at ? fmtDate(a.submitted_at.slice(0, 10)) : '—'}</td>
              <td><span className="badge">{a.status}</span></td>
              <td className="small">{['youth', 'adults', 'complex'].map((k) => a.answers?.experience?.[k] ? `${a.answers.experience[k]} y ${k}` : null).filter(Boolean).join(' · ') || '—'}<div className="muted">{a.answers?.education_highest ?? ''}</div></td>
              <td className="small">{a.flags?.length ? <span className="badge warn">{a.flags.length} prequalify “no”</span> : '—'}</td>
            </tr>))}
          </tbody>
        </table>
      )}

      <details className="card" open={p.status === 'Draft' || undefined}>
        <summary><strong>{edit ? 'Edit the posting' : 'Posting details'}</strong></summary>
        <PostingForm p={p} positions={positions} disabled={!edit} />
      </details>
    </main>
  );
}
