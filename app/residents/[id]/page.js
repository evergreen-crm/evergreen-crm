// One resident: their details, a form for a new shift note,
// and the timeline of notes (newest first).
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { addShiftNote, signShiftNote } from '@/app/actions';

export default async function ResidentPage({ params }) {
  const { id } = await params;
  const { supabase, user, profile } = await requireUser();
  const isStaff = ['admin', 'manager', 'staff'].includes(profile.role);

  const { data: resident } = await supabase
    .from('residents')
    .select('id, first_name, last_name, date_of_birth, admission_date, status, allergies, homes(name)')
    .eq('id', id)
    .maybeSingle();

  // Not allowed to see them = looks the same as not existing.
  if (!resident) notFound();

  const { data: notes } = await supabase
    .from('shift_notes')
    .select('id, note_date, shift, mood, meals, activities, note, share_with_family, signed_at, author_id, profiles(full_name)')
    .eq('resident_id', id)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <main>
      <h1>{resident.first_name} {resident.last_name}</h1>
      <p className="muted">
        {resident.homes?.name} · {resident.status}
        {resident.admission_date && ` · admitted ${resident.admission_date}`}
      </p>
      {isStaff && resident.allergies && (
        <p className="alert">Allergies: {resident.allergies}</p>
      )}

      {isStaff && (
        <form action={addShiftNote} className="card">
          <h2>New shift note</h2>
          <input type="hidden" name="resident_id" value={resident.id} />
          <div className="row">
            <label>
              Shift
              <select name="shift" required defaultValue="Day">
                <option>Day</option>
                <option>Evening</option>
                <option>Night</option>
              </select>
            </label>
            <label>
              Mood
              <select name="mood" defaultValue="">
                <option value="">—</option>
                <option>Happy</option>
                <option>Calm</option>
                <option>Anxious</option>
                <option>Upset</option>
                <option>Withdrawn</option>
              </select>
            </label>
            <label>
              Meals
              <select name="meals" defaultValue="">
                <option value="">—</option>
                <option>Ate all</option>
                <option>Ate some</option>
                <option>Refused</option>
              </select>
            </label>
          </div>
          <label>
            Activities
            <input name="activities" placeholder="e.g., walk, outing, program" />
          </label>
          <label>
            Note
            <textarea name="note" rows={4} required placeholder="What happened this shift?" />
          </label>
          <label className="check">
            <input type="checkbox" name="share_with_family" /> Share with family (after signing)
          </label>
          <div className="row">
            <button name="sign" value="yes">Save and sign</button>
            <button name="sign" value="no" className="secondary">Save as draft</button>
          </div>
          <p className="muted small">Signed notes are locked and can't be edited.</p>
        </form>
      )}

      <h2>Notes</h2>
      {notes?.length === 0 && <p className="muted">No notes yet.</p>}
      <ul className="timeline">
        {notes?.map((n) => (
          <li key={n.id} className={n.signed_at ? '' : 'draft'}>
            <div className="meta">
              {n.note_date} · {n.shift} shift · {n.profiles?.full_name ?? 'Staff'}
              {n.signed_at
                ? <span className="badge">Signed {new Date(n.signed_at).toLocaleString('en-CA')}</span>
                : <span className="badge warn">Draft</span>}
              {isStaff && n.share_with_family && <span className="badge">Shared with family</span>}
            </div>
            {(n.mood || n.meals || n.activities) && (
              <div className="muted small">
                {[n.mood && `Mood: ${n.mood}`, n.meals && `Meals: ${n.meals}`, n.activities && `Activities: ${n.activities}`]
                  .filter(Boolean).join(' · ')}
              </div>
            )}
            <p>{n.note}</p>
            {!n.signed_at && n.author_id === user.id && (
              <form action={signShiftNote}>
                <input type="hidden" name="note_id" value={n.id} />
                <input type="hidden" name="resident_id" value={resident.id} />
                <button className="secondary">Sign now</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
