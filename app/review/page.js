// 📋 Monthly QA review (COA PQI): every Program Coordinator (own house), Program Manager and director
// looks at last month — survey results, incidents, improvement actions — and writes what went well,
// what worries them and what they will do. Reminders go out on the 1st and the 10th.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf, groupOf } from '@/lib/levels';
import { addDaysISO, todayISO, fmtDate } from '@/lib/options';
import { SURVEYS, STAFF_ONLY } from '@/lib/surveys';
import { plainError } from '@/lib/plain';
import { saveReview } from './actions';

export const dynamic = 'force-dynamic';
const monthName = (iso) => new Date(iso.slice(0, 7) + '-15T12:00:00Z').toLocaleString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function MonthlyReview({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  if (lvl < 2 || groupOf(profile)) redirect('/?error=' + encodeURIComponent('The monthly QA review is for Program Coordinators, Program Managers and directors.'));
  const today = todayISO();
  const last = addDaysISO(today.slice(0, 7) + '-01', -1).slice(0, 7) + '-01';
  const month = /^\d{4}-\d{2}-01$/.test(sp.month ?? '') ? sp.month : last;
  const next = addDaysISO(addDaysISO(month, 32).slice(0, 7) + '-01', 0);
  const homeOnly = lvl === 2 ? profile.home_id : null;

  let sv = supabase.from('survey_sends').select('survey_key, status, score, concern, comments, home_id, completed_at').gte('created_at', addDaysISO(month, -30)).lt('created_at', next);
  let inc = supabase.from('incidents').select('id, is_critical, physical_intervention, status').gte('occurred_on', month).lt('occurred_on', next);
  let act = supabase.from('action_items').select('id, status, due_date').not('status', 'in', '("Closed","Dismissed")');
  if (homeOnly) { sv = sv.eq('home_id', homeOnly); inc = inc.eq('home_id', homeOnly); act = act.eq('home_id', homeOnly); }
  const [{ data: surveys }, { data: incidents }, { data: actions }, { data: mine }, { data: home }] = await Promise.all([
    sv, inc, act,
    supabase.from('qa_monthly_reviews').select('id, month, home_id, went_well, concerns, actions, created_at').eq('reviewer_id', user.id).order('month', { ascending: false }).limit(12),
    homeOnly ? supabase.from('homes').select('name').eq('id', homeOnly).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const done = (mine ?? []).find((r) => r.month === month);
  const answered = (surveys ?? []).filter((s) => s.status === 'Completed');
  const avg = (arr) => (arr.length ? Math.round((100 * arr.reduce((a, b) => a + Number(b.score ?? 0), 0)) / arr.length) / 100 : null);
  const byKey = Object.keys(SURVEYS).filter((k) => !STAFF_ONLY.has(k) || lvl >= 4).map((k) => {
    const all = (surveys ?? []).filter((s) => s.survey_key === k), got = answered.filter((s) => s.survey_key === k);
    return { k, sent: all.length, got: got.length, avg: avg(got.filter((s) => s.score !== null)), concerns: got.filter((s) => s.concern).length };
  }).filter((x) => x.sent);
  const comments = answered.filter((s) => s.comments && (!STAFF_ONLY.has(s.survey_key) || lvl >= 4)).slice(0, 10);
  const overdue = (actions ?? []).filter((a) => a.due_date && a.due_date < today).length;

  return (
    <main>
      <h1>📋 Monthly QA review — {monthName(month)}</h1>
      <p className="muted">{homeOnly ? `For ${home?.name ?? 'your house'}. ` : lvl === 3 ? 'For your houses. ' : 'For all of Evergreen. '}Due by the 10th of each month. COA PQI: review the results, then write what you will do.</p>
      {sp.ok && <p className="message ok">Saved — thank you. The directors can see it in the QA portal.</p>}
      {sp.error && <p className="message error">{plainError(sp.error)}</p>}

      <section className="qa-summary">
        <div className="qa-score"><span className="small muted">Surveys answered</span><strong>{answered.length}</strong><span className="small">of {(surveys ?? []).length} sent</span></div>
        <div className={`qa-score kpi-${answered.some((s) => s.concern) ? 'red' : 'green'}`}><span className="small muted">Survey concerns</span><strong>{answered.filter((s) => s.concern).length}</strong><span className="small">followed up?</span></div>
        <div className={`qa-score kpi-${(incidents ?? []).some((i) => i.is_critical) ? 'yellow' : 'green'}`}><span className="small muted">Incidents</span><strong>{(incidents ?? []).length}</strong><span className="small">{(incidents ?? []).filter((i) => i.is_critical).length} critical · {(incidents ?? []).filter((i) => i.physical_intervention).length} restraint</span></div>
        <div className={`qa-score kpi-${overdue ? 'red' : 'green'}`}><span className="small muted">Open actions</span><strong>{(actions ?? []).length}</strong><span className="small">{overdue} overdue</span></div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Survey results</h2>
        {!byKey.length ? <p className="muted small">No surveys this month.</p> : (
          <table className="qa-table"><thead><tr><th>Survey</th><th>Answered</th><th>Average (1–5)</th><th>Concerns</th></tr></thead>
            <tbody>{byKey.map((x) => <tr key={x.k}><td>{SURVEYS[x.k].audience}</td><td>{x.got} of {x.sent}</td><td className={`qa-cell qa-${x.avg === null ? 'none' : x.avg >= 4 ? 'green' : x.avg >= 3 ? 'yellow' : 'red'}`}>{x.avg ?? '—'}</td><td className={x.concerns ? 'bad-text' : ''}>{x.concerns}</td></tr>)}</tbody></table>
        )}
        {comments.length > 0 && <><h3 className="small">Comments</h3><ul className="small">{comments.map((c, i) => <li key={i}>“{c.comments}” <span className="muted">— {SURVEYS[c.survey_key].audience}</span></li>)}</ul></>}
      </section>

      {done ? (
        <section className="card"><h2 style={{ marginTop: 0 }}>✅ Your review for {monthName(month)}</h2>
          <p className="small"><strong>Went well:</strong> {done.went_well ?? '—'}</p><p className="small"><strong>Concerns:</strong> {done.concerns ?? '—'}</p><p className="small"><strong>What we will do:</strong> {done.actions ?? '—'}</p>
          <p className="muted small">Saved {fmtDate(done.created_at.slice(0, 10))}</p></section>
      ) : (
        <form action={saveReview} className="card">
          <h2 style={{ marginTop: 0 }}>Write your review</h2>
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="home_id" value={homeOnly ?? ''} />
          <label>What went well?<textarea name="went_well" rows={3} /></label>
          <label>What worries you? (patterns, low scores, late reports)<textarea name="concerns" rows={3} /></label>
          <label>What will you do, by when? (add an improvement action for anything big)<textarea name="actions" rows={3} /></label>
          <button>Save my review</button>
        </form>
      )}

      {(mine ?? []).length > 0 && (
        <details className="card"><summary><strong>My past reviews</strong></summary>
          <ul className="small">{mine.map((r) => <li key={r.id}><Link href={`/review?month=${r.month}`}>{monthName(r.month)}</Link></li>)}</ul></details>
      )}
    </main>
  );
}
