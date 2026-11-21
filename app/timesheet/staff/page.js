// 📇 Staff employment (read only): position, full-time or part-time, hours, start date, status and the wage on
// the signed offer letter, for every staff member. For Payroll (and HR and directors), so pay can be set up in
// the payroll provider without opening each HR record. Nothing can be changed here: HR and leaders change the
// job on the Job and offer letter page. Payroll reads signed offer letters: supabase/payroll-employment-view.sql
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canHR, canPayroll, levelOf, groupOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import PrintButton from '@/app/PrintButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Staff employment · Evergreen' };

const money = (n) => (n == null ? '' : `$${Number(n).toFixed(2)}`);

export default async function StaffEmployment({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const director = profile.role === 'admin' || (levelOf(profile) >= 4 && !groupOf(profile));
  if (!(canPayroll(profile) || canHR(profile) || director)) {
    redirect('/?error=' + encodeURIComponent('Staff employment details are for Payroll, HR and directors.'));
  }
  const showLeft = sp.show === 'all';

  const [{ data: people }, { data: details }, { data: offers }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, active, role, homes:homes!profiles_home_id_fkey(name)')
      .in('role', ['staff', 'manager']).order('full_name'),
    supabase.from('staff_details').select('profile_id, employee_no, position, employment_type, hours_per_week, hire_date, employment_status, last_day, home_address'),
    supabase.from('offer_letters').select('id, profile_id, position, wage, accepted_at, status')
      .eq('status', 'Accepted').order('accepted_at', { ascending: false }),
  ]);
  const det = Object.fromEntries((details ?? []).map((d) => [d.profile_id, d]));
  const signed = {};
  for (const o of offers ?? []) if (!signed[o.profile_id]) signed[o.profile_id] = o;

  const rows = (people ?? []).map((p) => ({ p, d: det[p.id] ?? {}, o: signed[p.id] }))
    .filter(({ p, d }) => showLeft || (p.active !== false && (!d.employment_status || d.employment_status === 'Active' || d.employment_status === 'On leave')));
  const missing = rows.filter(({ d, o }) => !d.position || !d.hire_date || !o).length;

  return (
    <main>
      <p className="small no-print"><Link href="/timesheet">← Timesheets</Link></p>
      <h1>📇 Staff employment</h1>
      <p className="muted">Read only. Position, hours, start date and the wage on each person’s signed offer letter. To change a job, HR or the person’s leader uses the Job and offer letter page.</p>
      <p className="small">
        {showLeft ? <Link href="/timesheet/staff">Show current staff only</Link> : <Link href="/timesheet/staff?show=all">Also show people who have left</Link>}
        {' · '}<PrintButton label="🖨 Print" />
      </p>
      {missing > 0 && <p className="message">{missing} {missing === 1 ? 'person is' : 'people are'} missing a position, start date or signed offer letter. HR can fill these in.</p>}

      <div className="table-wrap card">
        <table>
          <thead>
            <tr><th>Name</th><th>Employee no.</th><th>House</th><th>Position</th><th>Type</th><th>Hours / week</th><th>Start date</th><th>Status</th><th>Hourly wage (signed)</th></tr>
          </thead>
          <tbody>
            {rows.map(({ p, d, o }) => (
              <tr key={p.id}>
                <td><strong>{p.full_name}</strong>{d.home_address && <div className="small muted">{d.home_address}</div>}</td>
                <td>{d.employee_no ?? '—'}</td>
                <td>{p.homes?.name ?? '—'}</td>
                <td>{d.position ?? <span className="badge warn">Not set</span>}</td>
                <td>{d.employment_type ?? '—'}</td>
                <td>{d.hours_per_week ?? '—'}</td>
                <td>{d.hire_date ? fmtDate(d.hire_date) : <span className="badge warn">Not set</span>}</td>
                <td>{d.employment_status ?? 'Active'}{d.last_day && <div className="small muted">Last day {fmtDate(d.last_day)}</div>}</td>
                <td>{o ? <Link href={`/offer/${o.id}`}>{money(o.wage)}</Link> : <span className="badge warn">No signed letter</span>}
                  {o && o.position && d.position && o.position !== d.position && <div className="small muted">Letter is for {o.position}</div>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="muted">No staff yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small muted">The wage link opens the signed offer letter. Signed letters are also saved as PDFs in each staff file.</p>
    </main>
  );
}
