// HR portal: list of all staff with certificate warnings.
// Managers and admins only; staff are sent to their own HR page.
import { canHR } from '@/lib/levels';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { summarize } from '@/lib/hr';
import ProgramBadge from '@/app/components/ProgramBadge';
import { describeStaffId } from '@/lib/staffId';

export default async function HrPage({ searchParams }) {
  const sp = await searchParams;
  const former = sp.show === 'former';
  const { supabase, profile } = await requireUser();
  if (profile.role === 'staff' && !canHR(profile)) redirect(`/hr/${profile.id}`);
  if (profile.role === 'family') redirect('/');

  const [{ data: people }, { data: details }, { data: certs }, { data: psRole }, { data: cards }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, active, homes(name)')
      .in('role', ['admin', 'manager', 'staff']).order('full_name'),
    supabase.from('staff_details').select('profile_id, position, employment_type, employee_no, employment_status, last_day, program, hire_date'),
    supabase.from('certifications').select('profile_id, expires_on'),
    supabase.rpc('prescreen_role'),
    supabase.from('id_cards').select('profile_id, issued_on, printed_no'),
  ]);

  const detailsById = Object.fromEntries((details ?? []).map((d) => [d.profile_id, d]));
  const certsById = {};
  for (const c of certs ?? []) (certsById[c.profile_id] ??= []).push(c);

  const totals = summarize(certs ?? []);

  // Staff ID check: the number (EVG-YYMM-POS-P-NNNN) is only right once the hire date is entered,
  // and issued cards printed with an older number need reprinting.
  const current = (people ?? []).filter((p) => p.active && !['Resigned', 'Terminated', 'Retired'].includes(detailsById[p.id]?.employment_status ?? 'Active'));
  const noHire = current.filter((p) => !detailsById[p.id]?.hire_date);
  const reprint = (cards ?? []).filter((c) => c.issued_on && c.printed_no !== detailsById[c.profile_id]?.employee_no)
    .map((c) => current.find((p) => p.id === c.profile_id)).filter(Boolean);

  return (
    <main>
      <h1>HR portal</h1>
      <p className="muted">Staff records, certifications and training.</p>

      <div className="stats">
        <div className={`stat ${totals.expired ? 'bad' : ''}`}>
          <strong>{totals.expired}</strong><span>expired certificates</span>
        </div>
        <div className={`stat ${totals.soon ? 'warn' : ''}`}>
          <strong>{totals.soon}</strong><span>expiring in 30 days</span>
        </div>
        <div className="stat">
          <strong>{people?.filter((p) => p.active).length ?? 0}</strong><span>active staff</span>
        </div>
      </div>

      {(noHire.length > 0 || reprint.length > 0) && (
        <section className="card" id="staff-id-check">
          <h2>🪪 Staff ID check</h2>
          <p className="muted small">Staff IDs are made automatically: <strong>EVG-YYMM-POS-P-NNNN</strong> = year and month of hire · position · program (M MCFD, C CLBC, B both) · permanent staff number. They update themselves when the hire date, program or position changes.</p>
          {noHire.length > 0 && <p><span className="badge warn">{noHire.length} without a hire date</span> Their ID uses the account start month until the real hire date is entered:{' '}
            {noHire.map((p, i) => <span key={p.id}>{i ? ', ' : ''}<Link href={`/hr/${p.id}#details`}>{p.full_name}</Link></span>)}</p>}
          {reprint.length > 0 && <p><span className="badge warn">🖨 {reprint.length} card{reprint.length > 1 ? 's' : ''} to reprint</span> Printed with an old staff ID:{' '}
            {reprint.map((p, i) => <span key={p.id}>{i ? ', ' : ''}<Link href={`/hr/${p.id}#id-card`}>{p.full_name}</Link></span>)}</p>}
        </section>
      )}

      <nav className="tabs-bar">
        <Link href="/hr" className={!former ? 'on' : ''}>Current staff</Link>
        <Link href="/hr?show=former" className={former ? 'on' : ''}>Resigned / former staff</Link>
        {psRole && <Link href="/hr/prescreen">🧾 Prescreening</Link>}
        <Link href="/academy">🎓 Evergreen Academy</Link>
        <Link href="/policies">📘 Policies</Link>
      </nav>
      <table>
        <thead>
          <tr><th>Emp. no.</th><th>Name</th><th>Program</th><th>Position</th><th>Home</th><th>{former ? 'Left' : 'Certificates'}</th></tr>
        </thead>
        <tbody>
          {people?.filter((p) => {
            const st = detailsById[p.id]?.employment_status ?? 'Active';
            const gone = ['Resigned', 'Terminated', 'Retired'].includes(st);
            return former ? gone : !gone;
          }).map((p) => {
            const d = detailsById[p.id];
            const s = summarize(certsById[p.id]);
            return (
              <tr key={p.id} className={p.active ? '' : 'inactive'}>
                <td className="small" title={describeStaffId(d?.employee_no) ?? undefined}>{d?.employee_no ?? '—'}{d && !d.hire_date && <div className="muted">no hire date</div>}</td>
                <td><Link href={`/hr/${p.id}`}>{p.full_name}</Link>{d?.employment_status === 'On leave' && <span className="badge warn"> On leave</span>}</td>
                <td><ProgramBadge program={d?.program} /></td>
                <td>{d?.position ?? <span className="muted">—</span>}
                  {d?.employment_type && <span className="muted small"> · {d.employment_type}</span>}</td>
                <td>{p.homes?.name ?? '—'}</td>
                {former ? <td>{d?.employment_status} {d?.last_day && `· ${d.last_day}`}</td> : <td>
                  {s.expired > 0 && <span className="badge bad">{s.expired} expired</span>}{' '}
                  {s.soon > 0 && <span className="badge warn">{s.soon} expiring</span>}{' '}
                  {s.total === 0 && <span className="muted small">None on file</span>}
                  {s.total > 0 && s.expired === 0 && s.soon === 0 && <span className="badge">All valid</span>}
                </td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">To add a new staff member, use <Link href="/admin">Admin → Give a person access</Link>, then open their name here.</p>
    </main>
  );
}
