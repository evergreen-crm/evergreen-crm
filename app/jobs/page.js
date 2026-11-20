// Public Careers page (plan B5): open job postings. No sign-in needed.
import Link from 'next/link';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { fmtDate, todayISO } from '@/lib/options';
import { wageText } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Careers · Evergreen Community Care', description: 'Jobs at Evergreen Community Care: residential care for children, youth and adults in B.C.' };

const PROGRAM = { MCFD: 'Children and youth (MCFD)', CLBC: 'Adults (CLBC)', Both: 'Children, youth and adults' };

export default async function Jobs() {
  const today = todayISO();
  const { data } = adminKey()
    ? await createAdminClient().from('job_postings').select('job_id, title, program, location, employment_type, shift_team, wage_min, wage_max, wage_unit, summary, closing_date')
        .eq('status', 'Open').or(`closing_date.is.null,closing_date.gte.${today}`).order('published_at', { ascending: false })
    : { data: [] };
  return (
    <main style={{ maxWidth: 860, margin: '0 auto' }}>
      <p><img src="/logo.png" alt="Evergreen Community Care" style={{ width: 180 }} /></p>
      <h1>Careers at Evergreen Community Care</h1>
      <p>We provide residential care for children and youth (MCFD) and adults (CLBC) in British Columbia. We hire full-time and part-time staff on fixed day, evening and awake-night teams, with every other weekend off.</p>
      {(data ?? []).length === 0 ? <p className="card muted">There are no open jobs right now. Please check back soon.</p> : (data ?? []).map((p) => (
        <section key={p.job_id} className="card">
          <h2 style={{ marginTop: 0 }}><Link href={`/jobs/${p.job_id}`}>{p.title}</Link></h2>
          <p className="small muted">Job ID {p.job_id} · {PROGRAM[p.program]} · {p.employment_type}{p.shift_team && p.shift_team !== 'Any' ? ` · ${p.shift_team} team` : ''}{p.location ? ` · ${p.location}` : ''}</p>
          {wageText(p) && <p><strong>{wageText(p)}</strong></p>}
          {p.summary && <p>{p.summary.length > 300 ? p.summary.slice(0, 300) + '…' : p.summary}</p>}
          <p className="small">{p.closing_date ? `Apply by ${fmtDate(p.closing_date)}` : 'Open until filled'} · <Link href={`/jobs/${p.job_id}`}>Read more and apply →</Link></p>
        </section>
      ))}
      <p className="muted small">Evergreen Community Care is an equal opportunity employer. If you need an accommodation during hiring, tell us in your application or email HR. Staff sign in to the portal <Link href="/login">here</Link>.</p>
    </main>
  );
}
