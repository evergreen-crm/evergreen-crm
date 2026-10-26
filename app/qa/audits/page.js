// 🗂 Resident file audits (MCFD Tool D · COA GLS / CR). At least 25% of files every 6 months.
// Suggests which files to audit next (oldest audit first), records the checklist, and opens actions for gaps.
import Link from 'next/link';
import { fmtDate, todayISO, addDaysISO } from '@/lib/options';
import { FILE_AUDIT } from '@/lib/qa';
import { plainError } from '@/lib/plain';
import { requireQa } from '../guard';
import QaShell from '../QaShell';
import { saveAudit } from './actions';

export const dynamic = 'force-dynamic';
const resName = (r) => (r ? `${r.preferred_name || r.first_name} ${r.last_name ?? ''}`.trim() : '—');
const tone = (s) => (s === null || s === undefined ? 'none' : s >= 90 ? 'green' : s >= 75 ? 'yellow' : 'red');

export default async function QaAudits({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireQa('/qa/audits');
  const today = todayISO();
  const since = addDaysISO(today, -183);
  const [{ data: homes }, { data: residents }, { data: audits, error }] = await Promise.all([
    supabase.from('homes').select('id, name').order('name'),
    supabase.from('residents').select('id, home_id, first_name, last_name, preferred_name, status, care_plan_review_date').neq('status', 'discharged'),
    supabase.from('qa_file_audits').select('id, resident_id, home_id, audit_date, score, findings, action_id, auditor:auditor_id(full_name)').order('audit_date', { ascending: false }).limit(500),
  ]);
  if (error && /qa_file_audits|relation|schema cache/i.test(error.message)) return <QaShell active="/qa/audits" title="Quality assurance — resident file audits"><p className="message">Run supabase/qa-phase2.sql in Supabase first.</p></QaShell>;
  const all = audits ?? [];
  const res = residents ?? [];
  const rById = Object.fromEntries(res.map((r) => [r.id, r]));
  const last = {};
  for (const a of all) if (!last[a.resident_id]) last[a.resident_id] = a;

  const perHouse = (homes ?? []).map((h) => {
    const rs = res.filter((r) => r.home_id === h.id);
    const done = rs.filter((r) => last[r.id] && last[r.id].audit_date >= since);
    const need = Math.ceil(rs.length * 0.25);
    const scores = all.filter((a) => a.home_id === h.id && a.audit_date >= since).map((a) => a.score).filter((x) => x !== null);
    return { h, total: rs.length, done: done.length, need, avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null };
  });
  // Next to audit: never audited first, then oldest audit.
  const next = [...res].sort((a, b) => (last[a.id]?.audit_date ?? '0000') .localeCompare(last[b.id]?.audit_date ?? '0000')).slice(0, 8);
  const picked = sp.new ? rById[sp.new] : null;

  return (
    <QaShell active="/qa/audits" title="Quality assurance — resident file audits" printedBy={profile.full_name}
      intro="Audit at least 25% of resident files in every house every 6 months (MCFD Tool D, COA GLS and CR). Any item marked No, or a score under 90%, opens an improvement action for the house's Program Coordinator.">
      {sp.ok && <p className="message ok no-print">{sp.ok}</p>}
      {sp.error && <p className="message error no-print">{plainError(sp.error)}</p>}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Last 6 months by house</h2>
        <div className="table-wrap">
          <table className="qa-table">
            <thead><tr><th>House</th><th>Residents</th><th>Files audited</th><th>25% sample</th><th>Average score</th></tr></thead>
            <tbody>{perHouse.map((x) => (
              <tr key={x.h.id}><td>{x.h.name}</td><td>{x.total}</td><td>{x.done}</td>
                <td className={`qa-cell qa-${!x.total ? 'none' : x.done >= x.need ? 'green' : 'red'}`}>{!x.total ? '—' : x.done >= x.need ? '✓ met' : `${x.need - x.done} more needed`}</td>
                <td className={`qa-cell qa-${tone(x.avg)}`}>{x.avg === null ? '—' : `${x.avg}%`}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {picked ? (
        <section className="card no-print" id="audit">
          <h2 style={{ marginTop: 0 }}>Audit: {resName(picked)}</h2>
          <p className="small muted">Open the <Link href={`/residents/${picked.id}`} target="_blank">resident file</Link> in another tab and check each item.{picked.care_plan_review_date ? ` Care plan review date: ${fmtDate(picked.care_plan_review_date)}${picked.care_plan_review_date < today ? ' (overdue)' : ''}.` : ' No care plan review date on file.'}</p>
          <form action={saveAudit}>
            <input type="hidden" name="resident_id" value={picked.id} />
            <label style={{ maxWidth: 220 }}>Audit date<input type="date" name="audit_date" defaultValue={today} max={today} /></label>
            {FILE_AUDIT.map((g) => (
              <fieldset key={g.group} className="qa-audit-group">
                <legend><strong>{g.group}</strong></legend>
                {g.items.map((i) => (
                  <div key={i.id} className="qa-audit-item">
                    <span>{i.text}</span>
                    <span className="qa-audit-opts">
                      {[['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']].map(([v, l]) => <label key={v}><input type="radio" name={i.id} value={v} required /> {l}</label>)}
                    </span>
                  </div>
                ))}
              </fieldset>
            ))}
            <label>Findings and notes<textarea name="findings" rows={3} maxLength={4000} /></label>
            <button>Save audit</button> <Link href="/qa/audits" className="small">Cancel</Link>
          </form>
        </section>
      ) : (
        <section className="card no-print">
          <h2 style={{ marginTop: 0 }}>Audit next</h2>
          {!next.length ? <p className="muted small">No current residents.</p> : (
            <ul className="small">{next.map((r) => (
              <li key={r.id}><Link href={`/qa/audits?new=${r.id}#audit`}>{resName(r)}</Link> — {(homes ?? []).find((h) => h.id === r.home_id)?.name ?? '—'} · {last[r.id] ? `last audited ${fmtDate(last[r.id].audit_date)}` : 'never audited'}</li>
            ))}</ul>
          )}
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Audit history</h2>
        {!all.length ? <p className="muted small">No audits yet.</p> : (
          <table className="qa-table">
            <thead><tr><th>Date</th><th>Resident</th><th>House</th><th>Score</th><th>Auditor</th><th>Action</th></tr></thead>
            <tbody>{all.slice(0, 60).map((a) => (
              <tr key={a.id}><td className="small">{fmtDate(a.audit_date)}</td><td>{resName(rById[a.resident_id])}</td>
                <td className="small">{(homes ?? []).find((h) => h.id === a.home_id)?.name ?? '—'}</td>
                <td className={`qa-cell qa-${tone(a.score)}`}>{a.score ?? '—'}%</td><td className="small">{a.auditor?.full_name ?? '—'}</td>
                <td className="small">{a.action_id ? <Link href={`/action-items/${a.action_id}`}>Open action</Link> : '—'}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </QaShell>
  );
}
