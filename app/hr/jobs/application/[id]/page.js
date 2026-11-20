// HR: one job application (plan B5): everything the applicant sent, files, status, notes, pre-screening, decision.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canSeeJobs, canEditJobs } from '@/lib/jobsAccess';
import { fmtDate, fmtDateTime } from '@/lib/options';
import { STATUSES, prequalQuestions } from '@/lib/jobs';
import { updateApplication, startPrescreen, declineApplication } from '../../actions';

export const dynamic = 'force-dynamic';

const yn = (v) => ({ yes: 'Yes', no: 'No', unsure: 'Not sure', skip: 'Prefer not to answer' }[v] ?? (v || '—'));
const Row = ({ k, v }) => (v ? <><dt>{k}</dt><dd>{v}</dd></> : null);

export default async function HrApplication({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!canSeeJobs(profile)) redirect('/');
  const edit = canEditJobs(profile);
  const { data: a } = await supabase.from('job_applications')
    .select('*, posting:posting_id(id, title, job_id, program, shift_team, drives), decider:decided_by(full_name)').eq('id', id).maybeSingle();
  if (!a) notFound();
  const sign = async (path) => (path ? (await supabase.storage.from('applications').createSignedUrl(path, 600)).data?.signedUrl : null);
  const [resumeUrl, coverUrl] = await Promise.all([sign(a.resume_path), sign(a.cover_path)]);
  const x = a.answers ?? {};
  const c = x.contact ?? {};
  const closed = ['Hired', 'Not selected', 'Withdrawn'].includes(a.status);

  return (
    <main>
      <p><Link href={`/hr/jobs/${a.posting?.id}`}>← {a.posting?.title} ({a.posting?.job_id})</Link></p>
      <h1>{a.first_name} {a.last_name}</h1>
      <p className="muted">Sent {fmtDateTime(a.submitted_at)} · signed “{a.signed_name}” · <span className="badge">{a.status}</span>{a.decided_at ? ` · decided ${fmtDate(a.decided_at.slice(0, 10))}${a.decider?.full_name ? ` by ${a.decider.full_name}` : ''}` : ''}</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}
      {a.flags?.length > 0 && <div className="message"><strong>Prequalify answers to check:</strong><ul>{a.flags.map((f) => <li key={f}>“No” to: {f}</li>)}</ul></div>}

      {edit && (
        <section className="card no-print">
          <form action={updateApplication} className="row" style={{ alignItems: 'end' }}>
            <input type="hidden" name="id" value={a.id} />
            <label>Move to
              <select name="status" defaultValue={a.status}>{STATUSES.filter((s) => s !== 'Not selected').map((s) => <option key={s}>{s}</option>)}</select>
            </label>
            <button>Save status</button>
          </form>
          <div className="small" style={{ margin: '8px 0' }}>
            {a.prescreen_id
              ? <>📋 <Link href={`/hr/prescreen/${a.prescreen_id}`}>Open the pre-screening file</Link> (interview, references, checks)</>
              : !closed && <form action={startPrescreen} style={{ display: 'inline' }}><input type="hidden" name="id" value={a.id} /><button className="secondary small">📋 Start pre-screening (interview, references, checks)</button></form>}
          </div>
          {a.status === 'Hired' && <p className="small">✅ Hired. The Administrator adds them on <Link href={`/admin?from_app=${a.id}`}>Admin → Give a person access</Link>; name, email, phone, address and position fill in from this application, and the offer letter is made automatically. Their certificates copy into their staff file.</p>}
          <form action={updateApplication}>
            <input type="hidden" name="id" value={a.id} />
            <label>HR notes (only HR, the Administrator and the CEO see these)<textarea name="hr_notes" rows={3} maxLength={6000} defaultValue={a.hr_notes ?? ''} /></label>
            <button className="secondary small">Save notes</button>
          </form>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>1. Contact</h2>
        <dl className="kv">
          <Row k="Email" v={a.email} /><Row k="Phone" v={c.phone} /><Row k="Address" v={[c.address, c.city, c.postal].filter(Boolean).join(', ')} /><Row k="Contact by" v={c.preferred} />
        </dl>
        <h2>3. Prequalify</h2>
        <dl className="kv">{prequalQuestions(a.posting).map((q) => <Row key={q.key} k={q.q} v={yn(x.prequal?.[q.key]) + (x.prequal?.[`${q.key}_expiry`] ? ` (permit expires ${fmtDate(x.prequal[`${q.key}_expiry`])})` : '')} />)}</dl>
        <h2>4. Resume and cover letter</h2>
        <p>{resumeUrl ? <a href={resumeUrl} target="_blank" rel="noopener">📄 {a.resume_name ?? 'Resume'}</a> : 'No resume'}{' · '}{coverUrl ? <a href={coverUrl} target="_blank" rel="noopener">📄 {a.cover_name ?? 'Cover letter'}</a> : 'No cover letter'}</p>
        <h2>5. Education</h2>
        <p className="small">Highest level: <strong>{x.education_highest ?? '—'}</strong></p>
        <ul className="small">{(x.education ?? []).filter((e) => e.school || e.program).map((e, i) => <li key={i}>{e.level ?? ''} · {e.program ?? ''} · {e.school ?? ''} {e.year ? `(${e.year})` : ''}</li>)}</ul>
        <h2>6. Work experience</h2>
        <p className="small">Children and youth: {x.experience?.youth || '—'} years · Adults with disabilities: {x.experience?.adults || '—'} · Autism or complex needs: {x.experience?.complex || '—'}</p>
        {(x.work ?? []).filter((w) => w.employer).map((w, i) => (
          <div key={i} className="small" style={{ marginBottom: 8 }}><strong>{w.title}</strong>, {w.employer} · {w.start ?? '?'} to {w.current ? 'now' : w.end ?? '?'}{w.supervisor ? ` · supervisor ${w.supervisor}` : ''}<div>{w.duties}</div></div>))}
        <h2>7. Licences and certifications</h2>
        <ul className="small">{(x.certs ?? []).filter((z) => z.name).map((z, i) => <li key={i}>{z.name === 'Other' ? z.other : z.name}{z.number ? ` #${z.number}` : ''}{z.issued ? ` · issued ${fmtDate(z.issued)}` : ''}{z.expires ? ` · expires ${fmtDate(z.expires)}` : ''}</li>)}</ul>
        <h2>8. Languages</h2>
        <p className="small">{(x.languages ?? []).filter((l) => l.language).map((l) => `${l.language} (speak ${l.speak ?? '—'}, read ${l.read ?? '—'}, write ${l.write ?? '—'})`).join(' · ') || '—'}</p>
        <h2>9. References (supervisors)</h2>
        <ol className="small">{(x.refs ?? []).map((r, i) => <li key={i}>{r.name} · {r.title ?? ''} · {r.agency} · {r.email} · {r.phone}{r.how_long ? ` · supervised ${r.how_long}` : ''}</li>)}</ol>
        <h2>10. How they heard</h2>
        <p className="small">{x.referral?.heard || '—'}{x.referral?.staff ? ` · referred by ${x.referral.staff}` : ''} · Former Evergreen employee: {yn(x.referral?.former)}</p>
        <h2>11. Questions</h2>
        <dl className="kv">
          <Row k="Wage expectation" v={x.questions?.wage ? `$${x.questions.wage} per ${x.questions.wage_unit ?? 'hour'}` : null} />
          <Row k="Conflict of interest" v={yn(x.questions?.conflict) + (x.questions?.conflict_detail ? ` — ${x.questions.conflict_detail}` : '')} />
          <Row k="Accommodation during hiring" v={yn(x.questions?.accommodation)} />
        </dl>
        {x.questions?.selfid && Object.values(x.questions.selfid).some(Boolean) && (
          <details><summary className="small">Self-identification (optional answers; never used to decide)</summary>
            <p className="small">{Object.entries(x.questions.selfid).filter(([, v]) => v).map(([k, v]) => `${{ indigenous: 'First Nations, Métis or Inuit', disability: 'Disability', racialized: 'Racialized', lgbtq: '2SLGBTQIA+' }[k] ?? k}: ${v}`).join(' · ')}</p>
          </details>
        )}
      </section>

      {edit && !closed && (
        <section className="card no-print" id="decline">
          <h2 style={{ marginTop: 0 }}>Not selected</h2>
          <form action={declineApplication}>
            <input type="hidden" name="id" value={a.id} />
            <label className="check"><input type="checkbox" name="send_email" defaultChecked /> Send the polite “not moving forward” email from HR (no personal name)</label>
            <label className="check"><input type="checkbox" name="confirm" /> I confirm this applicant is not selected for this job</label>
            <button className="danger">Mark as not selected</button>
          </form>
          <p className="muted small">The application is deleted automatically one year after this decision.</p>
        </section>
      )}
    </main>
  );
}
