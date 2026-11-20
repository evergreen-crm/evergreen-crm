// Public job posting (plan B5) with the form to start an application.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { fmtDate, todayISO } from '@/lib/options';
import { wageText } from '@/lib/jobs';
import { startApplication } from '@/app/apply/actions';

export const dynamic = 'force-dynamic';
const PROGRAM = { MCFD: 'Children and youth (MCFD)', CLBC: 'Adults (CLBC)', Both: 'Children, youth and adults (MCFD and CLBC)' };

export async function generateMetadata({ params }) {
  const { jobId } = await params;
  return { title: `${jobId} · Careers · Evergreen Community Care` };
}

export default async function Posting({ params, searchParams }) {
  const { jobId } = await params;
  const sp = (await searchParams) ?? {};
  if (!/^ECC-JOB-\d{4}-\d{3,}$/.test(jobId) || !adminKey()) notFound();
  const { data: p } = await createAdminClient().from('job_postings').select('*').eq('job_id', jobId).maybeSingle();
  if (!p || p.status === 'Draft') notFound();
  const open = p.status === 'Open' && (!p.closing_date || p.closing_date >= todayISO());
  const para = (t) => (t ?? '').split(/\n+/).filter(Boolean).map((x, i) => <p key={i}>{x}</p>);
  return (
    <main style={{ maxWidth: 860, margin: '0 auto' }}>
      <p><Link href="/jobs">← All jobs</Link></p>
      <h1>{p.title}</h1>
      <p className="muted">Job ID <strong>{p.job_id}</strong> · {PROGRAM[p.program]} · {p.employment_type}{p.hours_per_week ? ` (${p.hours_per_week} hours a week)` : ''}{p.shift_team && p.shift_team !== 'Any' ? ` · ${p.shift_team} team` : ''}{p.location ? ` · ${p.location}` : ''}</p>
      {wageText(p) && <p style={{ fontSize: '1.15rem' }}><strong>Pay: {wageText(p)}</strong></p>}
      <p className="small">{p.closing_date ? `Apply by ${fmtDate(p.closing_date)}.` : 'Open until filled.'}</p>
      {p.summary && <section>{para(p.summary)}</section>}
      {p.duties && <section><h2>What you’ll do</h2>{para(p.duties)}</section>}
      {p.requirements && <section><h2>What you need</h2>{para(p.requirements)}</section>}
      <section><h2>How we work</h2>
        <ul>
          <li>Continuous paid duty with no separate breaks: you stay with the people in care for the whole shift, and eat with them.</li>
          <li>Fixed teams (day, evening or awake night) with every other weekend off.</li>
          <li>A criminal record check and MCFD / CLBC screening are needed before you start.</li>
          <li>Three professional references from people who supervised you.</li>
        </ul>
      </section>

      <section id="apply" className="card">
        <h2 style={{ marginTop: 0 }}>Apply online</h2>
        {!open ? <p>This job is closed for applications.</p> : (
          <>
            <p className="small">Start with your name and email. We email you a 6-digit code and a private link, so you can save and come back to finish. It takes about 20 minutes. Have your resume ready (PDF or Word).</p>
            {sp.error && <p className="message">{sp.error}</p>}
            <form action={startApplication}>
              <input type="hidden" name="job_id" value={p.job_id} />
              <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              <div className="row">
                <label>First name<input name="first" required maxLength={80} autoComplete="given-name" /></label>
                <label>Last name<input name="last" required maxLength={80} autoComplete="family-name" /></label>
              </div>
              <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
              <button>Start my application</button>
            </form>
            <p className="muted small">Your information is used only for hiring at Evergreen Community Care. If you are not hired, it is deleted one year after the decision.</p>
          </>
        )}
      </section>
    </main>
  );
}
