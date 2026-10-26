// ⚠️ Incidents & risk (COA RPM and BSM): the last 12 months by month, type and house,
// restraints, missing episodes, medication errors, reporting on time, and people with repeat incidents.
import Link from 'next/link';
import { addDaysISO, todayISO } from '@/lib/options';
import { writtenDue, reviewDue } from '@/lib/incidents';
import { programsFor } from '@/lib/requirements';
import { lastMonths, monthLabel } from '@/lib/qa';
import { requireQa } from '../guard';
import QaShell from '../QaShell';

export const dynamic = 'force-dynamic';
const name = (r) => (r ? `${r.preferred_name || r.first_name} ${r.last_name ?? ''}`.trim() : 'Resident');

async function rows(q) { const { data, error } = await q; return error ? [] : data ?? []; }

export default async function QaIncidents({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireQa('/qa/incidents');
  const today = todayISO();
  const months = lastMonths(today, 12);
  const from = `${months[0]}-01`;
  const house = /^[0-9a-f-]{36}$/i.test(sp.house ?? '') ? sp.house : null;

  let incQ = supabase.from('incidents').select('id, home_id, resident_id, occurred_on, incident_type, is_critical, is_urgent, physical_intervention, written_report_sent_on, internal_review_on, status, residents(first_name, last_name, preferred_name, funder, care_type)').gte('occurred_on', from);
  let misQ = supabase.from('missing_episodes').select('id, home_id, resident_id, started_at, police_called_at, found_at, status').gte('started_at', from);
  if (house) { incQ = incQ.eq('home_id', house); misQ = misQ.eq('home_id', house); }
  const [homes, incidents, missing, medErr, residents] = await Promise.all([
    rows(supabase.from('homes').select('id, name').order('name')),
    rows(incQ), rows(misQ),
    rows(supabase.from('med_administrations').select('id, resident_id, admin_date, residents(home_id)').eq('status', 'Error').gte('admin_date', from)),
    rows(supabase.from('residents').select('id, first_name, last_name, preferred_name, home_id').neq('status', 'discharged').order('first_name')),
  ]);
  const meds = house ? medErr.filter((m) => m.residents?.home_id === house) : medErr;
  const ym = (s) => String(s).slice(0, 7);
  const count = (arr, f) => months.map((m) => arr.filter((x) => ym(f(x)) === m).length);

  const lines = [
    { label: 'All incidents', vals: count(incidents, (i) => i.occurred_on) },
    { label: 'Critical incidents', vals: count(incidents.filter((i) => i.is_critical), (i) => i.occurred_on) },
    { label: '✋ Physical intervention / restraint', vals: count(incidents.filter((i) => i.physical_intervention), (i) => i.occurred_on) },
    { label: '🔎 Missing episodes', vals: count(missing, (m) => m.started_at) },
    { label: '💊 Medication errors', vals: count(meds, (m) => m.admin_date) },
  ];
  const max = Math.max(1, ...lines.flatMap((l) => l.vals));

  const byType = {};
  for (const i of incidents) byType[i.incident_type ?? 'Other'] = (byType[i.incident_type ?? 'Other'] ?? 0) + 1;
  const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);

  const byHouse = homes.map((h) => {
    const inc = incidents.filter((i) => i.home_id === h.id);
    return { h, total: inc.length, critical: inc.filter((i) => i.is_critical).length, restraint: inc.filter((i) => i.physical_intervention).length,
      missing: missing.filter((m) => m.home_id === h.id).length, meds: medErr.filter((m) => m.residents?.home_id === h.id).length };
  });

  // Reporting on time (critical incidents: written report to the funder; all: internal review).
  const crit = incidents.filter((i) => i.is_critical);
  const writtenOnTime = crit.filter((i) => i.written_report_sent_on && i.written_report_sent_on <= writtenDue(i, programsFor(i.residents ?? {})[0]?.key ?? 'mcfd')).length;
  const reviewDueList = incidents.filter((i) => reviewDue(i) <= today);
  const reviewedOnTime = reviewDueList.filter((i) => i.internal_review_on && i.internal_review_on <= reviewDue(i)).length;
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

  // Repeat incidents: 3 or more in the last 90 days for one person.
  const since90 = addDaysISO(today, -90);
  const per = {};
  for (const i of incidents.filter((x) => x.occurred_on >= since90 && x.resident_id)) (per[i.resident_id] ??= { r: i.residents, n: 0, home: i.home_id }).n++;
  const repeats = Object.entries(per).filter(([, v]) => v.n >= 3).sort((a, b) => b[1].n - a[1].n);
  const homeName = Object.fromEntries(homes.map((h) => [h.id, h.name]));

  return (
    <QaShell active="/qa/incidents" title="Quality assurance — incidents & risk" printedBy={profile.full_name}
      intro="COA RPM (Risk Prevention and Management) and BSM (Behavior Support and Management): look for patterns every quarter and add improvement actions for anything rising.">
      <section className="card no-print">
        <h2 style={{ marginTop: 0 }}>Enter</h2>
        <div className="qa-quickbar">
          <Link className="button secondary" href="/qa/records/rca#new">🧩 Root cause analysis</Link>
          <Link className="button secondary" href="/qa/records/risks#new">⚠️ Add to the risk register</Link>
          <Link className="button secondary" href="/qa/actions?new=1&std=RPM">🛠 Improvement action</Link>
        </div>
        <details>
          <summary className="small"><strong>+ Report a new incident</strong> (incidents are filed on the resident’s page)</summary>
          {!residents.length ? <p className="muted small">No current residents.</p> : (
            <ul className="small">{residents.map((r) => <li key={r.id}><Link href={`/residents/${r.id}?tab=incidents`}>{r.preferred_name || r.first_name} {r.last_name ? r.last_name[0] + '.' : ''}</Link> <span className="muted">— {homes.find((h) => h.id === r.home_id)?.name ?? ''}</span></li>)}</ul>
          )}
        </details>
      </section>
      <form className="row no-print" style={{ alignItems: 'end' }}>
        <label style={{ maxWidth: 320 }}>House<select name="house" defaultValue={house ?? ''}><option value="">All houses</option>{homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <button>Show</button>
      </form>

      <section className="qa-summary">
        <div className={`qa-score kpi-${crit.length ? (pct(writtenOnTime, crit.length) === 100 ? 'green' : 'red') : 'green'}`}><span className="small muted">Critical reports to funder on time</span><strong>{crit.length ? `${pct(writtenOnTime, crit.length)}%` : '—'}</strong><span className="small">{writtenOnTime} of {crit.length} (12 months)</span></div>
        <div className={`qa-score kpi-${reviewDueList.length ? ((pct(reviewedOnTime, reviewDueList.length) ?? 0) >= 90 ? 'green' : 'red') : 'green'}`}><span className="small muted">Internal reviews on time</span><strong>{reviewDueList.length ? `${pct(reviewedOnTime, reviewDueList.length)}%` : '—'}</strong><span className="small">{reviewedOnTime} of {reviewDueList.length}</span></div>
        <div className={`qa-score kpi-${repeats.length ? 'yellow' : 'green'}`}><span className="small muted">People with repeat incidents</span><strong>{repeats.length}</strong><span className="small">3+ in 90 days</span></div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Last 12 months</h2>
        <div className="table-wrap">
          <table className="qa-table qa-trend">
            <thead><tr><th></th>{months.map((m) => <th key={m}>{monthLabel(m)}</th>)}<th>Total</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.label}>
                  <td>{l.label}</td>
                  {l.vals.map((v, i) => <td key={i} className="qa-bar-cell"><span className="qa-bar" style={{ height: `${Math.round((v / max) * 28)}px` }} />{v || ''}</td>)}
                  <td><strong>{l.vals.reduce((a, b) => a + b, 0)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!incidents.length && !missing.length && !meds.length && <p className="muted small">No incidents, missing episodes or medication errors in the last 12 months.</p>}
      </section>

      <div className="qa-two">
        <section className="card">
          <h2 style={{ marginTop: 0 }}>By type</h2>
          {!types.length ? <p className="muted small">None.</p> : (
            <table className="qa-table"><tbody>{types.map(([t, n]) => <tr key={t}><td>{t}</td><td><strong>{n}</strong></td></tr>)}</tbody></table>
          )}
        </section>
        {!house && (
          <section className="card">
            <h2 style={{ marginTop: 0 }}>By house</h2>
            <table className="qa-table">
              <thead><tr><th>House</th><th>All</th><th>Critical</th><th>Restraint</th><th>Missing</th><th>Med errors</th></tr></thead>
              <tbody>{byHouse.map((x) => <tr key={x.h.id}><td><Link href={`/qa/incidents?house=${x.h.id}`}>{x.h.name}</Link></td><td>{x.total}</td><td>{x.critical}</td><td className={x.restraint ? 'bad-text' : ''}>{x.restraint}</td><td>{x.missing}</td><td>{x.meds}</td></tr>)}</tbody>
            </table>
          </section>
        )}
      </div>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Repeat incidents (3 or more in 90 days)</h2>
        {!repeats.length ? <p className="muted small">Nobody right now. 👍</p> : (
          <table className="qa-table">
            <thead><tr><th>Person</th><th>House</th><th>Incidents</th><th className="no-print"></th></tr></thead>
            <tbody>{repeats.map(([rid, v]) => (
              <tr key={rid}><td><Link href={`/residents/${rid}?tab=incidents`}>{name(v.r)}</Link></td><td>{homeName[v.home] ?? '—'}</td><td><strong>{v.n}</strong></td>
                <td className="no-print"><Link className="small" href={`/qa/actions?new=1&std=RPM&house=${v.home ?? ''}&title=${encodeURIComponent(`RPM: review support plan for ${name(v.r)} (${v.n} incidents in 90 days)`)}`}>+ Action</Link></td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </QaShell>
  );
}
