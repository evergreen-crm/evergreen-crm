// 📋 Surveys (COA PQI / CR): satisfaction results from youth, families, social workers, funders, staff,
// new hires, job applicants and referral sources — sent automatically by the nightly job.
// Plus the monthly QA reviews: who has done theirs for each of the last 3 months.
import Link from 'next/link';
import { fmtDate, addDaysISO, todayISO } from '@/lib/options';
import { levelOf, groupOf } from '@/lib/levels';
import { SURVEYS, SURVEY_KEYS, STAFF_ONLY } from '@/lib/surveys';
import { requireQa } from '../guard';
import QaShell from '../QaShell';

export const dynamic = 'force-dynamic';
const monthName = (iso) => new Date(iso.slice(0, 7) + '-15T12:00:00Z').toLocaleString('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const tone = (v) => (v === null ? 'none' : v >= 4 ? 'green' : v >= 3 ? 'yellow' : 'red');
const avg = (nums) => (nums.length ? Math.round((100 * nums.reduce((a, b) => a + b, 0)) / nums.length) / 100 : null);

export default async function QaSurveys({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireQa('/qa/surveys');
  const today = todayISO();
  const months = [6, 12, 24].includes(Number(sp.months)) ? Number(sp.months) : 6;
  const from = addDaysISO(today, -Math.round(months * 30.4));
  const [{ data: rows }, { data: homes }, { data: people }, { data: reviews }] = await Promise.all([
    supabase.from('survey_sends').select('id, survey_key, reason, home_id, resident_id, recipient_name, status, created_at, sent_at, reminders, completed_at, answers, score, concern, comments, followup_id, residents(first_name, last_name, preferred_name)').gte('created_at', from).order('created_at', { ascending: false }).limit(2000),
    supabase.from('homes').select('id, name').order('name'),
    supabase.from('profiles').select('id, full_name, role, level, staff_group, home_id, active').eq('active', true),
    supabase.from('qa_monthly_reviews').select('month, reviewer_id, home_id, created_at').gte('month', addDaysISO(today, -100)),
  ]);
  const all = rows ?? [];
  const homeName = Object.fromEntries((homes ?? []).map((h) => [h.id, h.name]));
  const done = all.filter((s) => s.status === 'Completed');

  const byKey = SURVEY_KEYS.map((k) => {
    const sent = all.filter((s) => s.survey_key === k && s.status !== 'Cancelled');
    const got = done.filter((s) => s.survey_key === k);
    const qAvg = SURVEYS[k].questions.map((q) => {
      const vals = got.map((s) => s.answers?.[q.id]).filter((v) => v !== undefined).map((v) => (v === 'yes' ? 5 : v === 'no' ? 1 : v));
      return { q, avg: avg(vals), n: vals.length, no: got.filter((s) => s.answers?.[q.id] === 'no').length };
    });
    return { k, sent: sent.length, got: got.length, rate: sent.length ? Math.round((100 * got.length) / sent.length) : null, avg: avg(got.map((s) => Number(s.score)).filter((x) => !Number.isNaN(x))), concerns: got.filter((s) => s.concern).length, qAvg };
  });
  const houseRows = (homes ?? []).map((h) => ({ h, cells: SURVEY_KEYS.filter((k) => !STAFF_ONLY.has(k)).map((k) => avg(done.filter((s) => s.home_id === h.id && s.survey_key === k).map((s) => Number(s.score)).filter((x) => !Number.isNaN(x)))) }));
  const concerns = done.filter((s) => s.concern);
  const waitingYouth = all.filter((s) => s.survey_key === 'youth' && s.status === 'Waiting');
  const comments = done.filter((s) => s.comments).slice(0, 30);

  // Monthly reviews: everyone who should review, for each of the last 3 months.
  const reviewers = (people ?? []).filter((p) => !groupOf(p) && p.role !== 'admin' && p.role !== 'family' && (levelOf(p) >= 3 || (levelOf(p) === 2 && p.home_id)) && levelOf(p) <= 7);
  const firstOf = (n) => { const d = new Date(today.slice(0, 7) + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7) + '-01'; };
  const revMonths = [3, 2, 1].map(firstOf);
  const did = new Set((reviews ?? []).map((r) => `${r.month}:${r.reviewer_id}`));

  return (
    <QaShell active="/qa/surveys" title="Quality assurance — surveys & monthly reviews" printedBy={profile.full_name}
      intro="Sent automatically: youth, families, social workers and funder contacts at 3 and 6 months after admission, then every 6 months and at discharge; new staff at 90 days; all staff yearly; job applicants after applying; referral sources after intake. Reminders at 7 and 14 days; links close after 30 days. A safety “no” or an average under 3 opens an improvement action.">
      <form className="row no-print" style={{ alignItems: 'end' }}>
        <label style={{ maxWidth: 240 }}>Period<select name="months" defaultValue={String(months)}><option value="6">Last 6 months</option><option value="12">Last 12 months</option><option value="24">Last 24 months</option></select></label>
        <button>Show</button>
      </form>

      <section className="qa-summary">
        <div className="qa-score"><span className="small muted">Surveys sent</span><strong>{all.length}</strong><span className="small">{done.length} answered ({all.length ? Math.round((100 * done.length) / all.length) : 0}%)</span></div>
        <div className={`qa-score kpi-${tone(avg(done.map((s) => Number(s.score)).filter((x) => !Number.isNaN(x))))}`}><span className="small muted">Average score</span><strong>{avg(done.map((s) => Number(s.score)).filter((x) => !Number.isNaN(x))) ?? '—'}</strong><span className="small">out of 5</span></div>
        <div className={`qa-score kpi-${concerns.length ? 'red' : 'green'}`}><span className="small muted">Concerns</span><strong>{concerns.length}</strong><span className="small">each has an action</span></div>
        <div className={`qa-score kpi-${waitingYouth.length ? 'yellow' : 'green'}`}><span className="small muted">Youth surveys to do</span><strong>{waitingYouth.length}</strong><span className="small">in person at the house</span></div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>By survey</h2>
        <div className="table-wrap">
          <table className="qa-table">
            <thead><tr><th>Survey</th><th>COA</th><th>Sent</th><th>Answered</th><th>Average (1–5)</th><th>Concerns</th></tr></thead>
            <tbody>{byKey.map((x) => (
              <tr key={x.k}><td>{SURVEYS[x.k].audience}</td><td className="small muted">{SURVEYS[x.k].coa}</td><td>{x.sent}</td><td>{x.got}{x.rate !== null ? ` (${x.rate}%)` : ''}</td>
                <td className={`qa-cell qa-${tone(x.avg)}`}>{x.avg ?? '—'}</td><td className={x.concerns ? 'bad-text' : ''}>{x.concerns}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>By house (average score)</h2>
        <div className="table-wrap">
          <table className="qa-table">
            <thead><tr><th>House</th>{SURVEY_KEYS.filter((k) => !STAFF_ONLY.has(k)).map((k) => <th key={k}>{SURVEYS[k].audience}</th>)}</tr></thead>
            <tbody>{houseRows.map((r) => <tr key={r.h.id}><td>{r.h.name}</td>{r.cells.map((v, i) => <td key={i} className={`qa-cell qa-${tone(v)}`}>{v ?? '—'}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>

      {byKey.filter((x) => x.got).map((x) => (
        <details key={x.k} className="card print-open">
          <summary><strong>{SURVEYS[x.k].audience}: question by question</strong> <span className="muted small">({x.got} answered)</span></summary>
          <table className="qa-table"><tbody>{x.qAvg.map(({ q, avg: v, n, no }) => (
            <tr key={q.id}><td>{q.text}</td><td className={`qa-cell qa-${tone(v)}`}>{q.yesno ? `${no} said no` : v ?? '—'}</td><td className="small muted">{n} answers</td></tr>
          ))}</tbody></table>
        </details>
      ))}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Concerns</h2>
        {!concerns.length ? <p className="muted small">None. 👍</p> : (
          <table className="qa-table"><thead><tr><th>When</th><th>Survey</th><th>House</th><th>Score</th><th>Follow-up</th></tr></thead>
            <tbody>{concerns.map((s) => (
              <tr key={s.id}><td className="small">{fmtDate(s.completed_at.slice(0, 10))}</td><td>{SURVEYS[s.survey_key].audience}{s.answers?.safe === 'no' ? <span className="badge bad"> safety: no</span> : null}</td>
                <td className="small">{homeName[s.home_id] ?? '—'}</td><td className="qa-cell qa-red">{s.score ?? '—'}</td>
                <td className="small">{s.followup_id ? <Link href={`/action-items/${s.followup_id}`}>Open action</Link> : '—'}</td></tr>
            ))}</tbody></table>
        )}
      </section>

      {comments.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Comments</h2>
          <ul className="small">{comments.map((s) => <li key={s.id} style={{ marginBottom: 6 }}>“{s.comments}” <span className="muted">— {SURVEYS[s.survey_key].audience}{homeName[s.home_id] ? `, ${homeName[s.home_id]}` : ''}, {fmtDate(s.completed_at.slice(0, 10))}</span></li>)}</ul>
          <p className="muted small">Staff and new-hire comments are shown without names.</p>
        </section>
      )}

      {waitingYouth.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Youth surveys waiting (in person)</h2>
          <ul className="small">{waitingYouth.map((s) => <li key={s.id}><Link href={`/surveys/${s.id}`}>{s.recipient_name}</Link> — {s.reason}, {homeName[s.home_id] ?? '—'} · since {fmtDate(s.created_at.slice(0, 10))}</li>)}</ul>
        </section>
      )}

      <section className="card" id="reviews">
        <h2 style={{ marginTop: 0 }}>Monthly QA reviews</h2>
        <p className="small muted">Due by the 10th for the month before. Reminders go out automatically on the 1st and the 10th.</p>
        {!reviewers.length ? <p className="muted small">No coordinators, managers or directors yet.</p> : (
          <div className="table-wrap">
            <table className="qa-table">
              <thead><tr><th>Reviewer</th><th>House</th>{revMonths.map((m) => <th key={m}>{monthName(m)}</th>)}</tr></thead>
              <tbody>{reviewers.map((p) => (
                <tr key={p.id}><td>{p.full_name}</td><td className="small">{homeName[p.home_id] ?? (levelOf(p) >= 4 ? 'All' : '—')}</td>
                  {revMonths.map((m) => { const ok = did.has(`${m}:${p.id}`); const due = addDaysISO(addDaysISO(m, 32).slice(0, 7) + '-10', 0); return <td key={m} className={`qa-cell qa-${ok ? 'green' : due < today ? 'red' : 'yellow'}`}>{ok ? '✓ done' : due < today ? '✗ missed' : '… due'}</td>; })}</tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="small"><Link href="/review">Write my own monthly review →</Link></p>
      </section>
    </QaShell>
  );
}
