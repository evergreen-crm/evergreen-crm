// 📄 Quarterly QA report (COA PQI): one printable page for the Board, the leadership team and the
// accreditation binder — readiness by COA area, incidents, surveys, file audits, standards and actions.
import { loadKpiData, computeKpis } from '@/lib/kpis';
import { COA_AREAS, areaScore, scoreColor, QA_DIVISION, QA_QUARTER_SIGNOFF } from '@/lib/qa';
import { plainError } from '@/lib/plain';
import QaRecordForm from '../records/QaRecordForm';
import { SURVEYS, SURVEY_KEYS } from '@/lib/surveys';
import { fmtDate } from '@/lib/options';
import { requireQa } from '../guard';
import QaShell from '../QaShell';

export const dynamic = 'force-dynamic';

// Quarter from "2026-Q3"; default = the last finished quarter.
function quarter(qs, today) {
  let y = Number(today.slice(0, 4)), q = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
  if (q === 0) { y -= 1; q = 4; }
  const m = /^(\d{4})-Q([1-4])$/.exec(qs ?? '');
  if (m) { y = Number(m[1]); q = Number(m[2]); }
  const pad = (n) => String(n).padStart(2, '0');
  const start = `${y}-${pad(q * 3 - 2)}-01`;
  const endD = new Date(Date.UTC(y, q * 3, 0));
  const end = endD.toISOString().slice(0, 10);
  const prevQ = q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`;
  const prevStart = q === 1 ? `${y - 1}-10-01` : `${y}-${pad(q * 3 - 5)}-01`;
  return { key: `${y}-Q${q}`, label: `Q${q} ${y}`, start, end, prevQ, prevStart };
}
const avg = (a) => (a.length ? Math.round((100 * a.reduce((x, y) => x + y, 0)) / a.length) / 100 : null);
const pct = (n, d) => (d ? Math.round((100 * n) / d) : null);
const change = (now, before) => (before === null || now === null ? '' : now > before ? ` ▲ from ${before}` : now < before ? ` ▼ from ${before}` : ' (same)');

export default async function QaReport({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireQa('/qa/report');
  const d = await loadKpiData(supabase);
  const today = d.today;
  const Q = quarter(sp.q, today);
  const quarters = Array.from({ length: 6 }, (_, i) => { const y = Number(today.slice(0, 4)), q0 = Math.floor((Number(today.slice(5, 7)) - 1) / 3); const n = y * 4 + q0 - i; return `${Math.floor(n / 4)}-Q${(n % 4) + 1}`; });

  const [{ data: inc }, { data: surveys }, { data: audits }, { data: stds }, { data: acts }, { data: reviews }, { data: signoffs }] = await Promise.all([
    supabase.from('incidents').select('id, occurred_on, incident_type, is_critical, physical_intervention, written_report_sent_on, internal_review_on').gte('occurred_on', Q.prevStart).lte('occurred_on', Q.end),
    supabase.from('survey_sends').select('survey_key, status, score, concern, created_at, completed_at').gte('created_at', Q.start).lte('created_at', Q.end + 'T23:59:59'),
    supabase.from('qa_file_audits').select('score, audit_date').gte('audit_date', Q.start).lte('audit_date', Q.end),
    supabase.from('qa_standards').select('area, code, status, due_date'),
    supabase.from('action_items').select('id, title, status, due_date, closed_at, created_at, category').eq('category', 'qa'),
    supabase.from('qa_monthly_reviews').select('month, concerns, actions').gte('month', Q.start).lte('month', Q.end),
    supabase.from('records').select('id, title, record_type, record_date, status, data, updated_at, author:created_by(full_name)').eq('division', QA_DIVISION).eq('area', 'quarterly').eq('record_type', Q.key).order('created_at', { ascending: false }).limit(1),
  ]);
  const signoff = signoffs?.[0] ?? null;
  const so = signoff?.data ?? {};

  const org = Object.fromEntries(computeKpis(d).map((k) => [k.key, k]));
  const areaRows = COA_AREAS.map((a) => ({ a, score: areaScore(a.kpis.map((k) => org[k]).filter(Boolean)) }));
  const scored = areaRows.map((r) => r.score).filter((x) => x !== null);
  const readiness = scored.length ? Math.round(scored.reduce((x, y) => x + y, 0) / scored.length) : null;

  const inQ = (inc ?? []).filter((i) => i.occurred_on >= Q.start);
  const inPrev = (inc ?? []).filter((i) => i.occurred_on < Q.start);
  const types = {};
  for (const i of inQ) types[i.incident_type ?? 'Other'] = (types[i.incident_type ?? 'Other'] ?? 0) + 1;
  const crit = inQ.filter((i) => i.is_critical);
  const restraints = inQ.filter((i) => i.physical_intervention).length, restraintsPrev = inPrev.filter((i) => i.physical_intervention).length;

  const done = (surveys ?? []).filter((s) => s.status === 'Completed');
  const bySurvey = SURVEY_KEYS.map((k) => ({ k, sent: (surveys ?? []).filter((s) => s.survey_key === k).length, got: done.filter((s) => s.survey_key === k) })).filter((x) => x.sent);

  const counted = (stds ?? []).filter((s) => s.status !== 'N/A');
  const qaActs = acts ?? [];
  const opened = qaActs.filter((a) => (a.created_at ?? '').slice(0, 10) >= Q.start && (a.created_at ?? '').slice(0, 10) <= Q.end);
  const closedInQ = qaActs.filter((a) => a.closed_at && a.closed_at.slice(0, 10) >= Q.start && a.closed_at.slice(0, 10) <= Q.end);
  const onTime = closedInQ.filter((a) => !a.due_date || a.closed_at.slice(0, 10) <= a.due_date).length;
  const stillOpen = qaActs.filter((a) => !['Closed', 'Dismissed', 'Approved'].includes(a.status));

  return (
    <QaShell active="/qa/report" title={`Quality assurance — quarterly report, ${Q.label}`} printedBy={profile.full_name}
      intro={`${fmtDate(Q.start)} to ${fmtDate(Q.end)}. For the Board, the leadership team and the COA evidence binder (PQI). Readiness scores are live as of today. Write the summary and sign-off at the bottom and press Save.`}>
      {sp.ok && <p className="message ok no-print">{sp.ok}</p>}
      {sp.error && <p className="message error no-print">{plainError(sp.error)}</p>}
      <form className="row no-print" style={{ alignItems: 'end' }}>
        <label style={{ maxWidth: 200 }}>Quarter<select name="q" defaultValue={Q.key}>{quarters.map((q) => <option key={q}>{q}</option>)}</select></label>
        <button>Show</button>
      </form>

      <section className="qa-summary">
        <div className={`qa-score kpi-${scoreColor(readiness)}`}><span className="small muted">COA readiness (today)</span><strong>{readiness ?? '—'}%</strong></div>
        <div className="qa-score"><span className="small muted">Incidents</span><strong>{inQ.length}</strong><span className="small">{crit.length} critical{change(inQ.length, inPrev.length)}</span></div>
        <div className="qa-score"><span className="small muted">Survey score</span><strong>{avg(done.map((s) => Number(s.score)).filter((x) => !Number.isNaN(x))) ?? '—'}</strong><span className="small">{done.length} answered of {(surveys ?? []).length}</span></div>
        <div className={`qa-score kpi-${stillOpen.some((a) => a.due_date && a.due_date < today) ? 'red' : 'green'}`}><span className="small muted">QA actions</span><strong>{opened.length}</strong><span className="small">opened · {closedInQ.length} closed ({pct(onTime, closedInQ.length) ?? '—'}% on time)</span></div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>1. Readiness by COA area</h2>
        <table className="qa-table"><tbody>{areaRows.map(({ a, score }) => (
          <tr key={a.code}><td>{a.icon} {a.code} — {a.title}</td><td className={`qa-cell qa-${scoreColor(score)}`}>{score === null ? '—' : `${score}%`}</td>
            <td className="small muted">{a.kpis.map((k) => org[k]).filter((k) => k && (k.status === 'red' || k.status === 'yellow')).map((k) => k.label).join(', ') || 'All on target'}</td></tr>
        ))}</tbody></table>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>2. Incidents and risk (RPM · BSM)</h2>
        <p className="small">Total {inQ.length}{change(inQ.length, inPrev.length)} (last quarter {inPrev.length}). Critical: {crit.length}. Restraints: {restraints}{change(restraints, restraintsPrev)}.
          {' '}Funder reports on time: {pct(crit.filter((i) => i.written_report_sent_on).length, crit.length) ?? '—'}%. Internal reviews done: {pct(crit.filter((i) => i.internal_review_on).length, crit.length) ?? '—'}%.</p>
        {Object.keys(types).length > 0 && <table className="qa-table"><tbody>{Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t, n]) => <tr key={t}><td>{t}</td><td>{n}</td></tr>)}</tbody></table>}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>3. Stakeholder surveys (PQI · CR)</h2>
        {!bySurvey.length ? <p className="muted small">No surveys this quarter.</p> : (
          <table className="qa-table"><thead><tr><th>Survey</th><th>Sent</th><th>Answered</th><th>Average (1–5)</th><th>Concerns</th></tr></thead>
            <tbody>{bySurvey.map((x) => { const v = avg(x.got.map((s) => Number(s.score)).filter((n) => !Number.isNaN(n))); return (
              <tr key={x.k}><td>{SURVEYS[x.k].audience}</td><td>{x.sent}</td><td>{x.got.length} ({pct(x.got.length, x.sent)}%)</td>
                <td className={`qa-cell qa-${v === null ? 'none' : v >= 4 ? 'green' : v >= 3 ? 'yellow' : 'red'}`}>{v ?? '—'}</td><td>{x.got.filter((s) => s.concern).length}</td></tr>); })}</tbody></table>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>4. Resident file audits (GLS)</h2>
        <p className="small">{(audits ?? []).length} files audited · average score {(audits ?? []).length ? Math.round((audits ?? []).reduce((s, a) => s + (a.score ?? 0), 0) / audits.length) : '—'}%.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>5. COA standards (as of today)</h2>
        <p className="small">{counted.filter((s) => s.status === 'Met').length} of {counted.length} met · {counted.filter((s) => ['In progress', 'Partially met'].includes(s.status)).length} in progress · {counted.filter((s) => ['Not met', 'Not started'].includes(s.status)).length} not met or not started · {counted.filter((s) => s.status !== 'Met' && s.due_date && s.due_date < today).length} past due.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>6. Improvement actions still open</h2>
        {!stillOpen.length ? <p className="muted small">None.</p> : (
          <table className="qa-table"><thead><tr><th>Action</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>{stillOpen.slice(0, 40).map((a) => <tr key={a.id}><td>{a.title}</td><td className="small">{a.status}</td><td className={`small ${a.due_date && a.due_date < today ? 'bad-text' : ''}`}>{a.due_date ? fmtDate(a.due_date) : '—'}</td></tr>)}</tbody></table>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>7. Themes from monthly reviews</h2>
        {!(reviews ?? []).some((r) => r.concerns || r.actions) ? <p className="muted small">No monthly review notes this quarter.</p> : (
          <ul className="small">{(reviews ?? []).filter((r) => r.concerns).slice(0, 20).map((r, i) => <li key={i}><strong>{fmtDate(r.month).replace(/^\d+ /, '')}:</strong> {r.concerns}</li>)}</ul>
        )}
      </section>

      <section className="card" id="signoff">
        <h2 style={{ marginTop: 0 }}>8. Summary and sign-off</h2>
        {signoff ? (
          <div className="small">
            {so.summary && <><h3>Summary and highlights</h3><p style={{ whiteSpace: 'pre-wrap' }}>{so.summary}</p></>}
            {so.concerns && <><h3>Main concerns</h3><p style={{ whiteSpace: 'pre-wrap' }}>{so.concerns}</p></>}
            {so.priorities && <><h3>Priorities for next quarter</h3><p style={{ whiteSpace: 'pre-wrap' }}>{so.priorities}</p></>}
            <p>Reviewed by the Executive Director: <strong>{so.ed_name || '____________________'}</strong> · Date: <strong>{so.ed_date ? fmtDate(so.ed_date) : '__________'}</strong>
              {' '}· Presented to the Board: <strong>{so.board_date ? fmtDate(so.board_date) : '__________'}</strong>{so.board_ref ? ` (${so.board_ref})` : ''}</p>
            <p className="muted">Status: {signoff.status} · saved by {signoff.author?.full_name ?? '—'}{signoff.updated_at ? `, last edited ${fmtDate(signoff.updated_at.slice(0, 10))}` : ''}</p>
          </div>
        ) : <p className="small print-only">Reviewed by the Executive Director: ____________________ Date: __________ &nbsp; Presented to the Board: __________</p>}
        <details className="no-print" open={!signoff || sp.edit === 'signoff'}>
          <summary className="small"><strong>{signoff ? '✏️ Edit the summary and sign-off' : 'Write the summary and sign-off'}</strong></summary>
          <QaRecordForm type={QA_QUARTER_SIGNOFF} record={signoff} fixedTitle={`QA report ${Q.label}`} fixedType={Q.key}
            back={`/qa/report?q=${Q.key}#signoff`} showAction={false} submitLabel="Save summary and sign-off" />
        </details>
      </section>
    </QaShell>
  );
}
