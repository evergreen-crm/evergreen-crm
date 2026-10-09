// CAREER & PERKS: Evergreen's career ladder, staff perks, "my next step", and promotion requests.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import { requestPromotion, decidePromotion } from './actions';

const PHASES = ['At launch', 'After 6 months', 'Year 1+'];
const CAT_ICON = { Recognition: '🌟', Growth: '🌱', Schedule: '🗓', Wellbeing: '💚', Pay: '💵', Practical: '🧰' };
const OPEN = ['Requested', 'Recommended', 'Board review'];

export default async function Careers({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  const [{ data: ladder, error }, { data: perks }, { data: promos }, { data: me }, { data: people }] = await Promise.all([
    supabase.from('career_ladder').select('*').order('step'),
    supabase.from('staff_perks').select('*').order('id'),
    supabase.from('staff_promotions').select('*').order('created_at', { ascending: false }),
    supabase.from('staff_details').select('hire_date, position').eq('profile_id', user.id).maybeSingle(),
    lvl >= 3 ? supabase.from('profiles').select('id, full_name') : Promise.resolve({ data: [] }),
  ]);
  const pName = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]));
  const step = (n) => (ladder ?? []).find((s) => s.step === n);
  const mine = (promos ?? []).filter((p) => p.staff_id === user.id);
  // Starting step from the access level (1-2 frontline/PC, 3 PM, 4+ leadership), raised by approved promotions.
  const levelStep = profile.role === 'admin' ? 6 : lvl >= 4 ? 6 : lvl === 3 ? 5 : lvl === 2 && !profile.staff_group ? 4 : 1;
  const myStep = Math.max(levelStep, ...mine.filter((p) => p.status === 'Approved').map((p) => p.to_step));
  const next = step(myStep + 1);
  const myOpen = mine.find((p) => OPEN.includes(p.status));
  const months = me?.hire_date ? Math.floor((Date.now() - new Date(me.hire_date + 'T12:00:00')) / (30.44 * 86400000)) : null;
  const queue = lvl >= 3 ? (promos ?? []).filter((p) => OPEN.includes(p.status) && p.staff_id !== user.id) : [];
  const decided = lvl >= 3 ? (promos ?? []).filter((p) => !OPEN.includes(p.status)).slice(0, 20) : [];

  return (
    <main>
      <h1>🌱 Career & perks</h1>
      <p className="muted">How to grow at Evergreen: a clear ladder, what each step needs, and the perks you get along the way.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}
      {error && <p className="message">The career ladder isn’t set up yet. Run <code>supabase/launch-people.sql</code> in Supabase → SQL Editor.</p>}

      {ladder?.length > 0 && (
        <section className="card">
          <h2>My next step</h2>
          <p>You are at <strong>Step {myStep}: {step(myStep)?.title}</strong>{months !== null && <> · {months} months at Evergreen</>}.</p>
          {next ? (
            <>
              <p><strong>Next: Step {next.step} — {next.title}</strong> (at least {next.min_months} months{next.requires_board ? ', Board of Directors decision' : ''})</p>
              <p className="small">{next.requirements}</p>
              {next.unlocks && <p className="small">🎁 <strong>Unlocks:</strong> {next.unlocks}</p>}
              {myOpen ? (
                <p className="badge warn">Your request for Step {myOpen.to_step} is in progress: {myOpen.status}</p>
              ) : (
                <form action={requestPromotion} className="no-print">
                  <input type="hidden" name="from_step" value={myStep} />
                  <input type="hidden" name="to_step" value={next.step} />
                  <label>Why you’re ready (optional)<textarea name="evidence" rows={2} placeholder="Training finished, mentoring, extra responsibilities…" /></label>
                  {next.requires_board && months !== null && months < next.min_months && <p className="small bad-text">Management steps need {next.min_months} months at Evergreen — you can ask now, but it can’t go to the Board until then.</p>}
                  <button>Ask for a promotion review</button>
                </form>
              )}
            </>
          ) : <p className="muted">You’re at the top of the ladder. 🎉</p>}
        </section>
      )}

      <h2>Career ladder</h2>
      <table>
        <thead><tr><th>Step</th><th>Role</th><th>Time at Evergreen</th><th>What it needs</th><th>Unlocks</th></tr></thead>
        <tbody>{(ladder ?? []).map((s) => (
          <tr key={s.step} style={s.step === myStep ? { background: '#e6f2ea' } : undefined}>
            <td><strong>{s.step}</strong></td>
            <td>{s.title}<div className="muted small">{s.staff_group}</div>{s.requires_board && <span className="badge warn">Board decision</span>}</td>
            <td>{s.min_months ? `${s.min_months}+ months` : 'From hire'}</td>
            <td className="small">{s.requirements}</td>
            <td className="small">{s.unlocks}<div className="muted">{s.pay_note}</div></td>
          </tr>))}
        </tbody>
      </table>
      <p className="muted small">Management positions (Program Coordinator and above) need at least 24 months at Evergreen, two satisfactory performance reviews in the last 12 months, and a decision by the Board of Directors.</p>

      <h2>Staff perks</h2>
      <div className="grid2">
        {PHASES.map((ph) => (
          <section key={ph} className="card">
            <h3 style={{ marginTop: 0 }}>{ph}</h3>
            <ul className="checklist">
              {(perks ?? []).filter((p) => p.phase === ph).map((p) => (
                <li key={p.id}><span className="req-text"><span>{CAT_ICON[p.category] ?? '•'}</span><span>{p.perk}<div className="muted small">{p.who_gets_it}</div></span></span></li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {mine.length > 0 && (
        <>
          <h2>My promotion requests</h2>
          <table>
            <thead><tr><th>Requested</th><th>To</th><th>Status</th><th>Decided</th></tr></thead>
            <tbody>{mine.map((p) => (
              <tr key={p.id}><td>{fmtDate(p.created_at.slice(0, 10))}</td><td>Step {p.to_step}: {step(p.to_step)?.title}</td><td>{p.status}</td><td>{p.decided_on ? fmtDate(p.decided_on) : '—'}</td></tr>))}
            </tbody>
          </table>
        </>
      )}

      {lvl >= 3 && (
        <section id="requests">
          <h2>Promotion requests to review</h2>
          {queue.length === 0 ? <p className="card muted">No requests waiting.</p> : queue.map((p) => {
            const s = step(p.to_step); const board = s?.requires_board;
            return (
              <div key={p.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong><Link href={`/hr/${p.staff_id}`}>{pName[p.staff_id] ?? 'Staff'}</Link> → Step {p.to_step}: {s?.title}</strong>
                  <span className={`badge${p.status === 'Board review' ? ' warn' : ''}`}>{p.status}</span>
                </div>
                <p className="small muted">{p.months_at_evergreen != null ? `${p.months_at_evergreen} months at Evergreen` : 'Hire date not in HR file'} · {p.satisfactory_reviews ?? 0} satisfactory reviews recorded{board ? ' · needs Board of Directors decision' : ''}</p>
                {p.evidence && <p className="small">“{p.evidence}”</p>}
                <p className="small"><strong>Needs:</strong> {s?.requirements}</p>
                <form action={decidePromotion} className="no-print">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="row">
                    <label>Satisfactory reviews (last 12 months)<input type="number" min="0" name="satisfactory_reviews" defaultValue={p.satisfactory_reviews ?? ''} /></label>
                    {p.months_at_evergreen == null && <label>Months at Evergreen<input type="number" min="0" name="months_at_evergreen" /></label>}
                    <label>Notes / evidence<input name="evidence" placeholder="Supervision notes, KPIs, training" /></label>
                  </div>
                  {p.status === 'Board review' ? (
                    lvl >= 7 ? (
                      <div className="row" style={{ alignItems: 'end' }}>
                        <label>Board meeting date<input type="date" name="board_meeting_date" required /></label>
                        <label>Motion / minutes reference<input name="board_reference" required placeholder="e.g. Motion 2026-14" /></label>
                        <button name="op" value="board_approve">Record: Board approved</button>
                        <button name="op" value="board_decline" className="danger">Record: Board declined</button>
                      </div>
                    ) : <p className="small muted">Waiting for the Board of Directors. The CEO or an Administrator records the decision.</p>
                  ) : (
                    <div className="row">
                      {p.status === 'Requested' && <button name="op" value="recommend">Recommend</button>}
                      {board && p.status === 'Recommended' && <button name="op" value="board">Send to Board review</button>}
                      {!board && p.status === 'Recommended' && <button name="op" value="approve">Approve promotion</button>}
                      <button name="op" value="decline" className="danger">Decline</button>
                    </div>
                  )}
                </form>
              </div>
            );
          })}
          {decided.length > 0 && (
            <details className="card"><summary>Recent decisions</summary>
              <table><tbody>{decided.map((p) => (
                <tr key={p.id}><td>{pName[p.staff_id]}</td><td>Step {p.to_step}</td><td>{p.status}</td><td className="small">{p.decided_on ? fmtDate(p.decided_on) : ''}{p.board_reference ? ` · Board ${p.board_reference}` : ''}</td></tr>))}
              </tbody></table>
            </details>
          )}
        </section>
      )}
    </main>
  );
}
