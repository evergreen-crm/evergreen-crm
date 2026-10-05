// Intake portal — managers start an intake and send MCFD / CLBC forms to be filled in and signed.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { fmtDate, todayISO } from '@/lib/options';
import ProgramBadge from '@/app/components/ProgramBadge';
import { createCase } from './actions';

export const metadata = { title: 'Intake · Evergreen' };

export default async function IntakeHome({ searchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireUser(['admin', 'manager']);
  const [{ data: cases }, { data: homes }, { data: reqs }] = await Promise.all([
    supabase.from('intake_cases').select('id, person_name, stream, status, referral_date, homes(name)').order('created_at', { ascending: false }),
    supabase.from('homes').select('id, name').order('name'),
    supabase.from('intake_requests').select('case_id, status'),
  ]);
  const count = (id, s) => (reqs ?? []).filter((r) => r.case_id === id && (!s || r.status === s)).length;
  const open = (cases ?? []).filter((c) => c.status === 'Open');
  const closed = (cases ?? []).filter((c) => c.status !== 'Open');

  const Row = ({ c }) => {
    const total = count(c.id) - count(c.id, 'Cancelled');
    const done = count(c.id, 'Completed');
    const pct = total ? Math.round((100 * done) / total) : 0;
    return (
      <li>
        <Link href={`/intake/${c.id}`}>
          <span><ProgramBadge program={c.stream} /> <strong>{c.person_name}</strong>
            <span className="muted small"> · referred {fmtDate(c.referral_date)}{c.homes?.name && ` · ${c.homes.name}`}</span></span>
          <span className="small intake-prog">
            <span className="pbar-track"><span style={{ width: `${pct}%` }} /></span>
            {done} of {total} signed {c.status !== 'Open' && <span className="badge">{c.status}</span>}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <main>
      <div className="div-banner" style={{ '--div': '#1f6fb2' }}>
        <span className="div-icon">📨</span>
        <div><h1>Intake</h1><p>Send MCFD and CLBC intake forms by email. People fill them in and sign online — no account needed.</p></div>
      </div>
      {sp.error && <p className="message">{sp.error}</p>}

      <details className="card" open={(cases ?? []).length === 0}>
        <summary><strong>+ Start a new intake</strong></summary>
        <form action={createCase}>
          <div className="row">
            <label>Name of child / youth / adult<input name="person_name" required /></label>
            <label>Program
              <select name="stream" required defaultValue=""><option value="" disabled>Choose…</option>
                <option value="MCFD">MCFD — child / youth</option><option value="CLBC">CLBC — adult</option></select>
            </label>
            <label>Referral date<input type="date" name="referral_date" defaultValue={todayISO()} /></label>
            <label>House (if known)
              <select name="home_id" defaultValue=""><option value="">—</option>{homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
            </label>
          </div>
          <label>Notes<textarea name="notes" rows={2} /></label>
          <button>Create intake</button>
        </form>
      </details>

      <h2>Open intakes</h2>
      {open.length === 0 ? <p className="muted">No open intakes.</p> : <ul className="list">{open.map((c) => <Row key={c.id} c={c} />)}</ul>}
      {closed.length > 0 && (<><h2>Closed</h2><ul className="list">{closed.map((c) => <Row key={c.id} c={c} />)}</ul></>)}
    </main>
  );
}
