// The form to create or edit a job posting (plan B5).
import { savePosting } from './actions';
import { EMPLOYMENT_TYPES, SHIFT_TEAMS } from '@/lib/jobs';

export default function PostingForm({ p = {}, positions = [], disabled = false }) {
  return (
    <form action={savePosting}>
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="row">
          <label>Job title *<input name="title" required maxLength={120} defaultValue={p.title ?? ''} placeholder="Youth Care Worker — awake nights" /></label>
          <label>Position (wage grid)
            <select name="position" defaultValue={p.position ?? ''}>
              <option value="">—</option>{positions.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label>Program
            <select name="program" defaultValue={p.program ?? 'Both'}><option value="MCFD">MCFD (children and youth)</option><option value="CLBC">CLBC (adults)</option><option value="Both">Both</option></select>
          </label>
          <label>House or area<input name="location" maxLength={120} defaultValue={p.location ?? ''} placeholder="e.g. Surrey" /></label>
        </div>
        <div className="row">
          <label>Full-time or part-time
            <select name="employment_type" defaultValue={p.employment_type ?? 'Full-time'}>{EMPLOYMENT_TYPES.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label>Shift team
            <select name="shift_team" defaultValue={p.shift_team ?? ''}><option value="">—</option>{SHIFT_TEAMS.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label>Hours a week<input name="hours_per_week" type="number" min="1" max="60" step="0.5" defaultValue={p.hours_per_week ?? ''} /></label>
        </div>
        <div className="row">
          <label>Wage from * (to publish)<input name="wage_min" inputMode="decimal" defaultValue={p.wage_min ?? ''} placeholder="25.50" /></label>
          <label>Wage to<input name="wage_max" inputMode="decimal" defaultValue={p.wage_max ?? ''} placeholder="28.75" /></label>
          <label>Per<select name="wage_unit" defaultValue={p.wage_unit ?? 'hour'}><option value="hour">hour</option><option value="year">year</option></select></label>
          <label>Closing date<input name="closing_date" type="date" defaultValue={p.closing_date ?? ''} /></label>
        </div>
        <p className="muted small">B.C. pay transparency rules require the wage or wage range on public job postings. Use the range from the <a href="/hr/wage-grid">Wage grid</a> for the position.</p>
        <label>Summary (first thing applicants read)<textarea name="summary" rows={3} maxLength={3000} defaultValue={p.summary ?? ''} /></label>
        <label>What you’ll do (one point per line)<textarea name="duties" rows={4} maxLength={4000} defaultValue={p.duties ?? ''} /></label>
        <label>What you need (one point per line)<textarea name="requirements" rows={4} maxLength={4000} defaultValue={p.requirements ?? ''} /></label>
        <label className="check"><input type="checkbox" name="drives" defaultChecked={!!p.drives} /> This job drives the people in care (asks about a B.C. driver’s licence)</label>
        <p><button>{p.id ? 'Save posting' : 'Create posting (draft)'}</button></p>
      </fieldset>
    </form>
  );
}
