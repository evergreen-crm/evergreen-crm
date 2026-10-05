// HR Prescreening: every applicant's screening file, with GREEN / YELLOW / RED clearance.
import Link from 'next/link';
import { requirePrescreen } from '@/lib/prescreenAuth';
import { POSITIONS, PROGRAMS, CLEARANCE, clearance, currentStep, interviewAvg, refsDone, renewals } from '@/lib/prescreen';
import ProgramBadge from '@/app/components/ProgramBadge';
import { createPrescreen } from './actions';

export const metadata = { title: 'Prescreening · Evergreen' };

const FILTERS = [['all', 'All'], ['green', 'Green – cleared'], ['yellow', 'Yellow – conditional'], ['red', 'Red – not cleared'], ['waiting', 'Waiting for applicant'], ['renewals', 'Renewals due']];

export default async function PrescreenList({ searchParams }) {
  const sp = await searchParams;
  const { supabase, prescreenRole } = await requirePrescreen();
  const { data } = await supabase.from('prescreens')
    .select('id, first_name, last_name, position, worker_type, program, drives, gives_meds, lived_outside, link_status, signed_at, items, interview, ref_checks, post, file_status, created_at')
    .order('created_at', { ascending: false });
  const rows = (data ?? []).map((p) => {
    const waiting = p.link_status !== 'Submitted';
    const due = renewals(p).filter((r) => r.days <= 60);
    return { p, waiting, clr: waiting ? null : clearance(p), step: currentStep(p), due };
  });
  const f = FILTERS.some(([k]) => k === sp.show) ? sp.show : 'all';
  const shown = rows.filter((r) => f === 'all' || (f === 'waiting' ? r.waiting : f === 'renewals' ? r.due.length : r.clr === f));
  const count = (k) => rows.filter((r) => (k === 'waiting' ? r.waiting : k === 'renewals' ? r.due.length : r.clr === k)).length;

  return (
    <main>
      <p className="small"><Link href="/hr">← HR portal</Link></p>
      <div className="div-banner" style={{ '--div': '#5a3d8a' }}>
        <span className="div-icon">🧾</span>
        <div><h1>Pre-employment screening</h1>
          <p>Every employee, contractor, volunteer, relief worker and caregiver with access to residents is screened and cleared here before working independently.</p></div>
      </div>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}

      <div className="stats">
        <div className="stat ps-green"><strong>{count('green')}</strong><span>Green – cleared</span></div>
        <div className={`stat ${count('yellow') ? 'warn' : ''}`}><strong>{count('yellow')}</strong><span>Yellow – conditional</span></div>
        <div className={`stat ${count('red') ? 'bad' : ''}`}><strong>{count('red')}</strong><span>Red – not cleared</span></div>
        <div className="stat"><strong>{count('waiting')}</strong><span>Waiting for applicant</span></div>
        <div className={`stat ${count('renewals') ? 'warn' : ''}`}><strong>{count('renewals')}</strong><span>Renewals due in 60 days</span></div>
      </div>

      <nav className="tabs-bar">
        {FILTERS.map(([k, l]) => <Link key={k} href={k === 'all' ? '/hr/prescreen' : `/hr/prescreen?show=${k}`} className={f === k ? 'on' : ''}>{l}</Link>)}
        <Link href="/hr/prescreen/standard">📘 Screening standard</Link>
        {prescreenRole === 'admin' && <Link href="/hr/prescreen/access">🔐 Who has access</Link>}
      </nav>

      {prescreenRole !== 'interviewer' && (
        <details className="card" open={rows.length === 0}>
          <summary><strong>+ Start a prescreen</strong></summary>
          <form action={createPrescreen}>
            <div className="row">
              <label>First name<input name="first_name" required /></label>
              <label>Last name<input name="last_name" /></label>
              <label>Email<input type="email" name="email" placeholder="for the private link and code" /></label>
              <label>Phone<input name="phone" type="tel" /></label>
            </div>
            <div className="row">
              <label>Position
                <select name="position" defaultValue=""><option value="">Choose…</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select>
              </label>
              <label>Will work with
                <select name="program" defaultValue="Both">{PROGRAMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </label>
            </div>
            <label className="check"><input type="checkbox" name="require_code" defaultChecked /> 🔒 Ask for an email code before the form opens (recommended when you email the link)</label>
            <button>Create prescreen</button>
            <p className="muted small">Next you’ll get a private link to email or text to the applicant, or you can open the form on this device if they’re with you.</p>
          </form>
        </details>
      )}

      {shown.length === 0 ? <p className="muted">{rows.length ? 'Nobody matches this filter.' : 'No prescreens yet.'}</p> : (
        <table>
          <thead><tr><th>Applicant</th><th>Program</th><th>Current step</th><th>Clearance</th><th>Interview</th><th>References</th><th>Renewals</th></tr></thead>
          <tbody>
            {shown.map(({ p, waiting, clr, step, due }) => {
              const avg = interviewAvg(p);
              return (
                <tr key={p.id} className={p.file_status === 'Not moving forward' ? 'inactive' : ''}>
                  <td><Link href={`/hr/prescreen/${p.id}`}><strong>{p.first_name} {p.last_name}</strong></Link>
                    <div className="muted small">{p.position ?? '—'}{p.worker_type && ` · ${p.worker_type}`}</div></td>
                  <td><ProgramBadge program={p.program} /></td>
                  <td>{waiting ? <span className="badge warn">{p.link_status === 'Cancelled' ? 'Link cancelled' : p.link_status === 'Opened' ? 'Applicant opened link' : 'Link sent'}</span> : step[1]}
                    {p.file_status === 'On hold' && <span className="badge"> On hold</span>}</td>
                  <td>{clr ? <span className={`ps-clr ps-${clr}`}>{CLEARANCE[clr].label.split(' –')[0]}</span> : <span className="muted">—</span>}</td>
                  <td className="small">{avg ? `${avg.toFixed(1)} / 5` : '—'}</td>
                  <td className="small">{refsDone(p)} / 3</td>
                  <td>{due.length ? <span className={`badge ${due[0].days < 0 ? 'bad' : 'warn'}`}>{due[0].days < 0 ? 'Expired' : `${due[0].days} days`}: {due[0].l.split(' (')[0]}</span> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
