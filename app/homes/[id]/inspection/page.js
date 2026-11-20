// 📁 Licensing inspection pack (plan E6): one printable page per house with what an MCFD or CLBC licensing officer
// usually asks for. Program Coordinators and up (for the houses they can see), the CEO and the Administrator.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import { loadInspectionPack } from '@/lib/inspectionPack';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inspection pack · Evergreen' };

const Flag = ({ list }) => (list?.length ? <span className="bad-text small">{list.join(' · ')}</span> : <span className="small">✓</span>);
const d = (x) => (x ? fmtDate(x) : '—');

export default async function InspectionPack({ params }) {
  const { id } = await params;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!(profile.role === 'admin' || (levelOf(profile) >= 2 && !profile.staff_group))) redirect('/');
  const p = await loadInspectionPack(supabase, id);
  if (!p) notFound();
  const { home, staffRows, resRows, drills, noDrill, checks, incidents, meds } = p;
  const realStaff = staffRows;   // test accounts are listed too, marked (test account)
  const staffWithFlags = staffRows.filter((s) => !s.test && s.flags.length).length;

  return (
    <main className="inspection-pack">
      <p className="no-print"><Link href={`/homes/${home.id}`}>← {home.name}</Link></p>
      <div className="title-row">
        <h1>📁 Licensing inspection pack — {home.name}</h1>
        <span className="no-print"><PrintButton /></span>
      </div>
      <p className="muted">Prepared {fmtDate(p.today)} by {profile.full_name}. Covers the last 12 months ({fmtDate(p.yearAgo)} to {fmtDate(p.today)}); medication covers the last 90 days. Full records are in the portal; this page is the summary and the index.</p>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>1. The house</h2>
        <dl className="kv">
          <dt>Address</dt><dd>{home.address || <span className="bad-text">missing</span>}</dd>
          <dt>Licence number</dt><dd>{home.licence_number || <span className="bad-text">missing</span>}</dd>
          <dt>Program</dt><dd>{home.program || '—'}{home.house_type ? ` · ${home.house_type}` : ''}</dd>
          <dt>Beds</dt><dd>{home.capacity ?? '—'} · currently {resRows.length} in care</dd>
          <dt>Staff on each shift</dt><dd>Day {home.staff_day ?? '—'} · Evening {home.staff_evening ?? '—'} · Awake night {home.staff_night ?? '—'}</dd>
          <dt>House phone</dt><dd>{home.phone || '—'}</dd>
          <dt>On-call phone</dt><dd>{home.on_call_phone || '—'}</dd>
        </dl>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>2. Staff ({realStaff.length}){staffWithFlags ? <span className="bad-text small"> · {staffWithFlags} with something to fix</span> : ''}</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="small">
            <thead><tr><th>Name</th><th>Position · start</th><th>Criminal record check</th><th>First Aid expires</th><th>Orientation</th><th>Courses passed</th><th>Policies signed</th><th>Check</th></tr></thead>
            <tbody>{realStaff.map((s) => (
              <tr key={s.id}>
                <td>{s.name}{s.test ? <span className="muted"> (test account)</span> : null}<div className="muted">{s.employee_no}</div></td>
                <td>{s.position || '—'}<div className="muted">{d(s.hire_date)}</div></td>
                <td>{s.crc ? d(s.crc.completed_on) : '—'}{s.crc && !s.crc.verified_by ? <div className="muted">not verified</div> : null}</td>
                <td>{s.firstAid ? d(s.firstAid.expires_on) : '—'}</td>
                <td>{d(s.orientation)}</td>
                <td>{s.passed} / {s.courseCount}</td>
                <td>{s.signed} / {s.policyCount}</td>
                <td><Flag list={s.flags} /></td>
              </tr>))}
              {realStaff.length === 0 && <tr><td colSpan={8} className="muted">No staff assigned to this house yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>3. Youth and adults in care ({resRows.length})</h2>
        <table className="small">
          <thead><tr><th>Name</th><th>Care type · program</th><th>Admitted</th><th>Care plan review</th><th>Consents</th><th>Check</th></tr></thead>
          <tbody>{resRows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}<div className="muted">{r.file_number ?? ''}</div></td>
              <td>{[r.care_type, r.program].filter(Boolean).join(' · ') || '—'}</td>
              <td>{d(r.admission_date)}</td>
              <td>{r.next_review ? `next ${d(r.next_review)}` : '—'}{r.last_review ? <div className="muted">last {d(r.last_review)}</div> : null}</td>
              <td>{r.consentsExpired.length ? <span className="bad-text">Expired: {r.consentsExpired.join(', ')}</span> : r.consentsSoon.length ? <span>Expiring soon: {r.consentsSoon.join(', ')}</span> : '✓'}</td>
              <td><Flag list={r.flags} /></td>
            </tr>))}
            {resRows.length === 0 && <tr><td colSpan={6} className="muted">Nobody in care at this house.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>4. Fire drills ({drills.length} in 12 months)</h2>
        {noDrill.length > 0 ? <p className="bad-text small">No drill recorded in: {noDrill.map((m) => new Date(m + '-15T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' })).join(', ')}</p> : <p className="small">✓ A drill every month.</p>}
        <table className="small"><thead><tr><th>Date</th><th>Type</th><th>Evacuation time</th><th>People out</th><th>Issues</th></tr></thead>
          <tbody>{drills.slice(0, 24).map((x, i) => (
            <tr key={i}><td>{d(x.entry_date)}</td><td>{x.data?.drill_type ?? '—'}</td><td>{x.data?.evac_time ?? '—'}</td><td>{x.data?.residents_out ?? '—'}</td><td>{x.data?.issues ?? ''}</td></tr>))}
          </tbody></table>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>5. Safety checks ({p.checksTotal} in 12 months)</h2>
        {checks.length === 0 ? <p className="bad-text small">No safety checks recorded.</p> : (
          <table className="small"><thead><tr><th>What was checked</th><th>Times</th><th>Last</th><th>Still needs action</th></tr></thead>
            <tbody>{checks.map((c) => <tr key={c.item}><td>{c.item}</td><td>{c.count}</td><td>{d(c.last)}</td><td>{c.open ? <span className="bad-text">{c.open}</span> : '—'}</td></tr>)}</tbody></table>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>6. Incidents ({incidents.total} in 12 months)</h2>
        <dl className="kv">
          <dt>Critical / reportable</dt><dd>{incidents.critical}</dd>
          <dt>Critical with the written report late (over 24 hours) or missing</dt><dd>{incidents.late ? <span className="bad-text">{incidents.late}</span> : '0 ✓'}</dd>
          <dt>Without a manager review after 7 days</dt><dd>{incidents.noReview ? <span className="bad-text">{incidents.noReview}</span> : '0 ✓'}</dd>
          <dt>Still open</dt><dd>{incidents.open}</dd>
          <dt>Medication errors</dt><dd>{incidents.medErrors}</dd>
        </dl>
        {Object.keys(incidents.byType).length > 0 && <p className="small">By type: {Object.entries(incidents.byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>7. Medication (last 90 days)</h2>
        <p className="small">{meds.total} doses recorded{meds.total ? ': ' + Object.entries(meds.counts).map(([k, v]) => `${k} ${v}`).join(' · ') : '.'} Every dose and every refusal is in the MAR in the portal.</p>
      </section>

      <section className="card print-only-break">
        <h2 style={{ marginTop: 0 }}>Reviewed with the licensing officer</h2>
        <p className="small">Officer name: ______________________________ &nbsp; Date: ______________</p>
        <p className="small">Evergreen representative: ______________________________ &nbsp; Signature: ______________________</p>
        <p className="small">Follow-up items: ____________________________________________________________________________</p>
      </section>
    </main>
  );
}
