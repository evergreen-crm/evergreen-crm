// House activity plan: what the house does each day, when, for whom, and which shift runs it.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtTime } from '@/lib/options';
import { saveActivity, setActivityActive } from '@/app/homes/activity-actions';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHIFTS = ['Day', 'Evening', 'Awake night', 'Sleep night', 'Any'];

export default async function ActivityPlanPage({ params }) {
  const { id } = await params;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: home } = await supabase.from('homes').select('id, name, program').eq('id', id).maybeSingle();
  if (!home) notFound();
  const canEdit = profile.role === 'admin' || levelOf(profile) >= 3 || (levelOf(profile) === 2 && profile.home_id === id);

  const [{ data: acts }, { data: residents }] = await Promise.all([
    supabase.from('activity_plans').select('*').eq('home_id', id).order('time_from', { nullsFirst: true }),
    supabase.from('residents').select('id, first_name, last_name, preferred_name, status').eq('home_id', id).neq('status', 'discharged').order('first_name'),
  ]);
  const name = (r) => r.preferred_name || r.first_name;
  const byId = Object.fromEntries((residents ?? []).map((r) => [r.id, name(r)]));
  const whoFor = (a) => (a.resident_ids?.length ? a.resident_ids.map((x) => byId[x] ?? '—').join(', ') : 'Whole house');
  const rows = (acts ?? []);

  return (
    <main>
      <div className="title-row">
        <h1>Activity plan: {home.name}</h1>
        <span className="small no-print"><Link href={`/homes/${id}`}>← Back to the house</Link></span>
      </div>
      <p className="muted small">{home.program ?? 'Program not set'} · What the house does each day, when, who it is for, and which shift runs it.</p>

      {DAYS.map((d, wd) => {
        const list = rows.filter((a) => a.weekday === wd && a.active);
        const every = rows.filter((a) => a.weekday == null && a.active);
        const all = [...list, ...every].sort((a, b) => String(a.time_from ?? '').localeCompare(String(b.time_from ?? '')));
        return (
          <section key={d} className="card">
            <h3>{d}</h3>
            {all.length === 0 && <p className="muted small">Nothing planned.</p>}
            {all.map((a) => (
              <div key={a.id} className="small" style={{ borderTop: '1px solid #eee', padding: '6px 0' }}>
                <strong>{a.time_from ? `${fmtTime(a.time_from)}${a.time_to ? `–${fmtTime(a.time_to)}` : ''}` : 'Any time'}</strong> · {a.activity}
                {' · '}<span className="muted">{a.shift ?? 'Any shift'} · {whoFor(a)}</span>
                {a.notes && <span className="muted"> · {a.notes}</span>}
                {canEdit && (
                  <form action={setActivityActive} className="no-print" style={{ display: 'inline' }}>
                    <input type="hidden" name="home_id" value={id} /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="active" value="0" />
                    {' '}<button className="link small">Take off plan</button>
                  </form>
                )}
              </div>
            ))}
          </section>
        );
      })}

      {rows.some((a) => !a.active) && <p className="muted small">{rows.filter((a) => !a.active).length} activities are off the plan (kept for the record).</p>}

      {canEdit && (
        <details className="card no-print">
          <summary><strong>+ Add an activity</strong></summary>
          <form action={saveActivity} className="stack">
            <input type="hidden" name="home_id" value={id} />
            <div className="row">
              <label>Day
                <select name="weekday" defaultValue="">
                  <option value="">Every day</option>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </label>
              <label>From<input name="time_from" type="time" /></label>
              <label>To<input name="time_to" type="time" /></label>
              <label>Shift
                <select name="shift" defaultValue="Day">{SHIFTS.map((s) => <option key={s}>{s}</option>)}</select>
              </label>
            </div>
            <label>What is the activity<input name="activity" required placeholder="e.g., Cooking group, Bus to school, Bed check" /></label>
            <label>For which residents (leave all unticked for the whole house)
              <div className="row">
                {(residents ?? []).map((r) => (
                  <label key={r.id} className="check"><input type="checkbox" name="resident_ids" value={r.id} /> {name(r)}</label>
                ))}
              </div>
            </label>
            <label>Notes<input name="notes" /></label>
            <button>Add to the plan</button>
          </form>
        </details>
      )}
    </main>
  );
}
