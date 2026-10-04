// "Goals" tab: care plan goals and daily progress.
import { GOAL_DOMAINS, fmtDate } from '@/lib/options';
import { addGoal, setGoalStatus } from '@/app/residents/modules';
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
