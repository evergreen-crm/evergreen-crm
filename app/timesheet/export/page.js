// Payroll export (plan B2): approved hours for a pay period, by pay type, as a file for the payroll provider.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { addDaysISO, todayISO, fmtDate, fmtDateTime } from '@/lib/options';
import { COLUMNS } from '@/lib/payroll';
import { loadPayroll, canExportPayroll } from '@/lib/payrollData';

export const metadata = { title: 'Payroll export' };

export default async function PayrollExport({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!canExportPayroll(profile)) redirect('/timesheet');
  const today = todayISO();
  const { period, rows, stats, exports, lastExport, changedSince, notApproved } = await loadPayroll(supabase, sp.p ?? addDaysISO(today, -14));
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const link = (d) => `/timesheet/export?p=${d}`;

  return (
    <main>
      <div className="title-row">
        <h1>💵 Payroll export</h1>
        <span className="small no-print">
          <Link href={link(addDaysISO(period.start, -14))}>← Previous period</Link>{' · '}
          <Link href={link(addDaysISO(today, -14))}>Last period</Link>{' · '}
          <Link href={link(today)}>Current</Link>{' · '}
          <Link href={link(addDaysISO(period.start, 14))}>Next →</Link>
        </span>
      </div>
      <p className="muted">Pay period <strong>{fmtDate(period.start)} to {fmtDate(period.end)}</strong>. Only approved hours are paid. Hours are split the B.C. Employment Standards way: overtime after 8 hours a day (double after 12) and after 40 hours a week (Sunday to Saturday); hours worked on a stat holiday at time and a half.</p>

      {lastExport && (
        <p className={`message${changedSince ? '' : ' ok'}`}>
          Last downloaded {fmtDateTime(lastExport.exported_at)} by {lastExport.by?.full_name ?? '—'} ({lastExport.people} people, {Number(lastExport.total_hours).toFixed(2)} hours).
          {changedSince > 0 && <> <strong>{changedSince} time {changedSince === 1 ? 'entry was' : 'entries were'} approved after that download</strong> — download again and send the new file.</>}
        </p>
      )}

      {notApproved.length > 0 && (
        <section className="card" style={{ borderLeft: '4px solid #c77700' }}>
          <h2 style={{ marginTop: 0 }}>⚠ {notApproved.length} {notApproved.length === 1 ? 'entry is' : 'entries are'} not approved yet</h2>
          <p className="small">These hours are <strong>not</strong> in the file. Approve them in <Link href={`/timesheet?p=${period.start}`}>Staff hours</Link>, then come back.</p>
          <ul className="small">{notApproved.slice(0, 15).map((e) => (
            <li key={e.id}>{e.full_name} · {fmtDateTime(e.clock_in)} {e.open ? <span className="badge warn">still clocked in</span> : <span className="badge warn">pending</span>}</li>))}
            {notApproved.length > 15 && <li>…and {notApproved.length - 15} more</li>}
          </ul>
        </section>
      )}

      {stats.length > 0 && <p className="small">📅 Stat holiday{stats.length > 1 ? 's' : ''} in this period: {stats.map((s) => `${s.name} (${fmtDate(s.date)})`).join(', ')}. Stat holiday pay (an average day's pay) is worked out by the payroll provider; the Notes column says who is eligible.</p>}

      <div className="stats">
        <div className="stat"><strong>{rows.length}</strong><span>people</span></div>
        <div className="stat"><strong>{total.toFixed(2)}</strong><span>total hours</span></div>
        <div className="stat"><strong>{(sum('ot15') + sum('ot2')).toFixed(2)}</strong><span>overtime hours</span></div>
        <div className={`stat ${notApproved.length ? 'warn' : ''}`}><strong>{notApproved.length}</strong><span>not approved</span></div>
      </div>

      {rows.length === 0 ? <p className="card muted">No approved hours in this pay period.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Staff</th>{COLUMNS.map(([k, l]) => <th key={k} className="small">{l}</th>)}<th>Total</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.profile_id}>
                <td><Link href={`/timesheet?p=${period.start}&staff=${r.profile_id}`}>{r.full_name}</Link>
                  <div className="muted small">{r.employee_no}{r.position ? ` · ${r.position}` : ''}</div>
                  {r.notes.map((n, i) => <div key={i} className="small">ℹ {n}</div>)}</td>
                {COLUMNS.map(([k]) => <td key={k}>{r[k] ? r[k].toFixed(2) : '—'}</td>)}
                <td><strong>{r.total.toFixed(2)}</strong></td>
              </tr>))}
            </tbody>
            <tfoot><tr><td><strong>Total</strong></td>{COLUMNS.map(([k]) => <td key={k}><strong>{sum(k).toFixed(2)}</strong></td>)}<td><strong>{total.toFixed(2)}</strong></td></tr></tfoot>
          </table>
        </div>
      )}

      <p className="no-print">
        <a className="button" href={`/timesheet/export/csv?p=${period.start}`}>⬇ Download file for the payroll provider (CSV)</a>
      </p>
      <p className="muted small">The file opens in Excel and imports into most payroll systems. Salaried Program Coordinators and Program Managers are listed with their hours for the record; pay them by their salary. Each download is recorded below.</p>

      {exports.length > 0 && (
        <details className="card"><summary>Download history for this period ({exports.length})</summary>
          <table><tbody>{exports.map((x, i) => (
            <tr key={i}><td>{fmtDateTime(x.exported_at)}</td><td>{x.by?.full_name ?? '—'}</td><td>{x.people} people</td><td>{Number(x.total_hours).toFixed(2)} h</td><td>{x.not_approved ? `${x.not_approved} not approved at the time` : ''}</td></tr>))}
          </tbody></table>
        </details>
      )}
    </main>
  );
}
