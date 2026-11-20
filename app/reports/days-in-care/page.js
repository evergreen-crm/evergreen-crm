// 🛏 Days-in-care report (plan E5): nights in care per youth or adult, month by month, for one year.
// Groundwork for billing: whichever way MCFD / CLBC pay, invoices start from these numbers.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { fmtDate } from '@/lib/options';
import { MONTH_NAMES } from '@/lib/daysInCare';
import { loadDaysInCare, canSeeDaysInCare } from '@/lib/daysInCareData';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Days in care · Evergreen' };

export default async function DaysInCare({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!canSeeDaysInCare(profile)) redirect('/');
  const thisYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Etc/GMT+7' }).format(new Date()).slice(0, 4));
  const year = /^\d{4}$/.test(sp.year ?? '') && +sp.year >= 2020 && +sp.year <= thisYear ? +sp.year : thisYear;
  const { months, rows, homes, noDates, today } = await loadDaysInCare(supabase, year);
  const monthTotals = months.map((_, i) => rows.reduce((a, r) => a + (r.perMonth[i] ?? 0), 0));
  const grand = rows.reduce((a, r) => a + r.total, 0);

  return (
    <main>
      <div className="title-row">
        <h1>🛏 Days in care — {year}</h1>
        <span className="small no-print"><Link href={`/reports/days-in-care?year=${year - 1}`}>← {year - 1}</Link>{year < thisYear && <> · <Link href={`/reports/days-in-care?year=${year + 1}`}>{year + 1} →</Link></>}</span>
      </div>
      <p className="muted">Nights in care for each youth and adult, by month, worked out from their admission and discharge dates. The admission day counts; the discharge day doesn’t (one per night). The current month counts up to tonight ({fmtDate(today)}). When the first contract is signed, invoices start from these numbers.</p>

      {noDates.length > 0 && <p className="message small">⚠ No admission date, so not counted: {noDates.map((r, i) => <span key={r.id}>{i ? ', ' : ''}<Link href={`/residents/${r.id}?tab=profile`}>{`${r.first_name ?? ''} ${r.last_name ?? ''}`.trim()}</Link></span>)}. Add it on their profile.</p>}

      <div className="stats">
        <div className="stat"><strong>{rows.length}</strong><span>youth and adults</span></div>
        <div className="stat"><strong>{grand}</strong><span>nights in care in {year}</span></div>
        <div className="stat"><strong>{rows.reduce((a, r) => a + r.awayTotal, 0)}</strong><span>nights missing</span></div>
      </div>

      {rows.length === 0 ? <p className="card muted">Nobody was in care in {year}.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="small">
            <thead><tr><th>Name</th><th>House</th><th>Admitted / discharged</th>{MONTH_NAMES.map((m) => <th key={m}>{m}</th>)}<th>Total</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/residents/${r.id}`}>{r.name}</Link><div className="muted">{[r.program, r.funder, r.file_number].filter(Boolean).join(' · ')}</div></td>
                <td>{r.home}</td>
                <td>{fmtDate(r.admission_date)}{r.discharge_date ? <div>→ {fmtDate(r.discharge_date)}</div> : <div className="muted">in care</div>}</td>
                {r.perMonth.map((v, i) => <td key={i} title={r.away[i] ? `${r.away[i]} night(s) missing` : undefined}>{v == null ? '' : v}{r.away[i] ? <sup> ⚠{r.away[i]}</sup> : null}</td>)}
                <td><strong>{r.total}</strong></td>
              </tr>))}
            </tbody>
            <tfoot>
              {homes.length > 1 && homes.map((h) => (
                <tr key={h.home}><td colSpan={3}>{h.home} ({h.people})</td>{h.perMonth.map((v, i) => <td key={i}>{months[i].from > today ? '' : v}</td>)}<td><strong>{h.total}</strong></td></tr>))}
              <tr><td colSpan={3}><strong>Total</strong></td>{monthTotals.map((v, i) => <td key={i}><strong>{months[i].from > today ? '' : v}</strong></td>)}<td><strong>{grand}</strong></td></tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="small muted">⚠ = nights in that month with an open missing-youth episode (shown for information; how they are billed depends on the contract).</p>
      <p className="no-print"><a className="button" href={`/reports/days-in-care/csv?year=${year}`}>⬇ Download for Excel (CSV)</a></p>
    </main>
  );
}
