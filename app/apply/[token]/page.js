// The applicant's private application link (plan B5): email code, then fill in, save, sign and send; afterwards, status.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { sessionHashFor, validToken } from '@/lib/applyAuth';
import { APPLICANT_STATUS, emptyAnswers } from '@/lib/jobs';
import { fmtDate } from '@/lib/options';
import CodeGate from './CodeGate';
import ApplyForm from './ApplyForm';
import Withdraw from './Withdraw';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My application · Evergreen Community Care', robots: { index: false } };

const hint = (e) => `${e.split('@')[0].slice(0, 2)}•••@${e.split('@')[1] ?? ''}`;

export default async function Apply({ params, searchParams }) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};
  if (!validToken(token) || !adminKey()) notFound();
  const admin = createAdminClient();
  const { data: app } = await admin.from('job_applications')
    .select('id, status, email, first_name, answers, resume_name, resume_path, cover_name, cover_path, submitted_at, session_hash, posting:posting_id(job_id, title, program, shift_team, drives, status, closing_date)')
    .eq('token', token).maybeSingle();
  if (!app) notFound();
  const sess = await sessionHashFor(token);
  const verified = !!sess && sess === app.session_hash;

  return (
    <main style={{ maxWidth: 860, margin: '0 auto' }}>
      <p><img src="/logo.png" alt="Evergreen Community Care" style={{ width: 160 }} /></p>
      <h1>Application: {app.posting?.title}</h1>
      <p className="muted">Job ID {app.posting?.job_id} · <Link href={`/jobs/${app.posting?.job_id}`}>See the job posting</Link></p>
      {sp.error && <p className="message">{sp.error}</p>}
      {!verified ? <CodeGate token={token} emailHint={hint(app.email)} justSent={sp.sent === '1'} testCode={process.env.NEXT_PUBLIC_APP_ENV === 'test' && /^\d{6}$/.test(sp.testcode ?? '') ? sp.testcode : null} /> : app.status === 'Draft' ? (
        <ApplyForm token={token} posting={app.posting}
          initial={{ ...emptyAnswers({ first: app.first_name, email: app.email }), ...(app.answers ?? {}) }}
          files={{ resume: app.resume_name, cover: app.cover_name }} />
      ) : (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Status: {APPLICANT_STATUS[app.status] ?? app.status}</h2>
          <p>Thank you, {app.first_name}. Your application was sent on {fmtDate(app.submitted_at?.slice(0, 10))}{app.status === 'Withdrawn' ? ' and has been withdrawn' : ''}.</p>
          {!['Hired', 'Not selected', 'Withdrawn'].includes(app.status) && <p className="small">HR contacts you by your preferred contact method if you move to the next step. You can come back to this link at any time to see the status.</p>}
          {!['Hired', 'Not selected', 'Withdrawn'].includes(app.status) && <Withdraw token={token} />}
        </section>
      )}
    </main>
  );
}
