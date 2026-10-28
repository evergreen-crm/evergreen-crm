// "Goals" tab: care plan goals and daily progress.
import { GOAL_DOMAINS, fmtDate } from '@/lib/options';
import { addGoal, setGoalStatus, recordGoalReview } from '@/app/residents/modules';
import { addGoalStep, toggleGoalStep } from '@/app/document/actions';
import { todayISO, addDaysISO } from '@/lib/options';
import EntryForm from '@/app/components/EntryForm';
import EntryList from '@/app/components/EntryList';

const LEVEL_SCORE = { Independent: 3, 'With prompts': 2, 'With full support': 1, 'Refused / not attempted': 0 };

export default async function Goals({ supabase, resident, canEdit, isStaff, isAdmin }) {
  const [{ data: goals }, { data: progress }] = await Promise.all([
    supabase.from('goals').select('*').eq('resident_id', resident.id).order('status').order('created_at'),
    supabase.from('entries').select('*, author:created_by(full_name)')
      .eq('resident_id', resident.id).eq('kind', 'goal_progress')
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(200),
  ]);
  const goalIds = (goals ?? []).map((g) => g.id);
  const { data: stepRows } = goalIds.length
    ? await supabase.from('goal_steps').select('id, goal_id, step, done_on, sort').in('goal_id', goalIds).order('sort').order('created_at')
    : { data: [] };
  const stepsByGoal = {};
  for (const s of stepRows ?? []) (stepsByGoal[s.goal_id] ??= []).push(s);
  const active = (goals ?? []).filter((g) => g.status === 'Active');
  const names = Object.fromEntries((goals ?? []).map((g) => [g.id, g.title]));
  const path = `/residents/${resident.id}`;

  return (
    <section>
      {isStaff && active.length > 0 && (
        <EntryForm kind="goal_progress" homeId={resident.home_id} residentId={resident.id} path={path}
          goals={active} shareable title="Record goal progress" open />
      )}
      {(goals ?? []).length === 0 && <p className="muted">No goals yet.{canEdit && ' Add the goals from the care plan (ICP / ISP) below.'}</p>}

      <div className="cards">
        {(goals ?? []).map((g) => {
          const recent = (progress ?? []).filter((p) => p.data?.goal_id === g.id).slice(0, 10);
          const avg = recent.length ? recent.reduce((s, p) => s + (LEVEL_SCORE[p.data.level] ?? 0), 0) / recent.length : null;
          return (
            <div key={g.id} className={`house ${g.status !== 'Active' ? 'faded' : ''}`}>
              <strong>{g.title}</strong>
              <span className="muted small">{[g.domain, g.target_date && `target ${fmtDate(g.target_date)}`].filter(Boolean).join(' · ')}</span>
              {g.description && <span className="small">{g.description}</span>}
              {g.status === 'Active' && (() => {
                const t = todayISO();
                if (!g.review_date) return <span className="badge warn">No review date set</span>;
                if (g.review_date < t) return <span className="badge bad">Review overdue since {fmtDate(g.review_date)}</span>;
                if (g.review_date <= addDaysISO(t, 14)) return <span className="badge warn">Review due {fmtDate(g.review_date)}</span>;
                return <span className="small muted">Next review {fmtDate(g.review_date)}</span>;
              })()}
              {g.reviewed_on && <span className="small muted">Last reviewed {fmtDate(g.reviewed_on)}{g.review_note ? `: ${g.review_note}` : ''}</span>}
              {(() => {
                const steps = stepsByGoal[g.id] ?? [];
                const doneCount = steps.filter((s) => s.done_on).length;
                return (
                  <div className="small" style={{ marginTop: 6 }}>
                    <strong>Steps to achieve this goal{steps.length ? ` (${doneCount} of ${steps.length} done)` : ''}</strong>
                    {steps.length === 0 && <p className="muted small" style={{ margin: '2px 0' }}>No steps yet.</p>}
                    <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0' }}>
                      {steps.map((s) => (
                        <li key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ textDecoration: s.done_on ? 'line-through' : 'none' }}>{s.step}</span>
                          {s.done_on && <span className="badge">Done {fmtDate(s.done_on)}</span>}
                          {isStaff && (
                            <form action={toggleGoalStep} className="no-print" style={{ display: 'inline' }}>
                              <input type="hidden" name="id" value={s.id} />
                              <input type="hidden" name="done" value={s.done_on ? 'no' : 'yes'} />
                              <input type="hidden" name="path" value={path} />
                              <button className="secondary" style={{ minHeight: 0, padding: '2px 8px' }}>{s.done_on ? 'Undo' : 'Mark done'}</button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                    {canEdit && g.status === 'Active' && (
                      <form action={addGoalStep} className="row no-print">
                        <input type="hidden" name="goal_id" value={g.id} />
                        <input type="hidden" name="path" value={path} />
                        <input name="step" placeholder="Add a step" aria-label={`New step for ${g.title}`} required />
                        <button className="secondary">Add step</button>
                      </form>
                    )}
                  </div>
                );
              })()}
              {canEdit && g.status === 'Active' && (
                <details className="no-print">
                  <summary className="link small">Record a review</summary>
                  <form action={recordGoalReview} className="stack">
                    <input type="hidden" name="id" value={g.id} /><input type="hidden" name="resident_id" value={resident.id} />
                    <div className="row">
                      <label>Reviewed on<input type="date" name="reviewed_on" defaultValue={todayISO()} required /></label>
                      <label>Next review<input type="date" name="review_date" defaultValue={addDaysISO(todayISO(), 90)} required /></label>
                    </div>
                    <label>What was decided<input name="review_note" placeholder="e.g., Continue; now with prompts only" /></label>
                    <button className="secondary">Save review</button>
                  </form>
                </details>
              )}
              <span>
                <span className={`badge ${g.status === 'Achieved' ? '' : g.status === 'Active' ? 'warn' : ''}`}>{g.status}</span>{' '}
                {avg !== null && <span className="small muted">Last {recent.length}: {'●'.repeat(Math.round(avg))}{'○'.repeat(3 - Math.round(avg))} ({avg >= 2.5 ? 'mostly independent' : avg >= 1.5 ? 'with prompts' : 'needs support'})</span>}
              </span>
              {canEdit && (
                <form action={setGoalStatus} className="row no-print">
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="resident_id" value={resident.id} />
                  <select name="status" defaultValue={g.status}><option>Active</option><option>Achieved</option><option>Discontinued</option></select>
                  <button className="secondary">Update</button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <details className="card no-print">
          <summary><strong>+ Add a goal</strong></summary>
          <form action={addGoal}>
            <input type="hidden" name="resident_id" value={resident.id} />
            <label>Goal<input name="title" required placeholder="e.g., Make own breakfast" /></label>
            <div className="row">
              <label>Area<select name="domain" defaultValue="">{['', ...GOAL_DOMAINS].map((d) => <option key={d} value={d}>{d || '—'}</option>)}</select></label>
              <label>Target date<input type="date" name="target_date" /></label>
              <label>Next review date<input type="date" name="review_date" defaultValue={addDaysISO(todayISO(), 90)} /></label>
            </div>
            <label>How staff support it<textarea name="description" rows={2} /></label>
            <button>Add goal</button>
          </form>
        </details>
      )}

      <h2>Progress</h2>
      <EntryList entries={progress} ctx={{ goals: names }} path={path} isAdmin={isAdmin} showFamily={isStaff} empty="No progress recorded yet." />
    </section>
  );
}
