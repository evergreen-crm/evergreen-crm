// One resident: their details, a form for a new shift note,
// and the timeline of notes (newest first).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { addShiftNote, signShiftNote } from '@/app/actions';
import { age, fmtDate, fmtTime, todayISO } from '@/lib/options';

function Fact({ label, value }) {
  if (!value) return null;
  return (<><dt>{label}</dt><dd>{value}</dd></>);
}

export default async function ResidentPage({ params }) {
  const { id } = await params;
  const { supabase, user, profile } = await requireUser();
  const isStaff = ['admin', 'manager', 'staff'].includes(profile.role);

  const canEdit = ['admin', 'manager'].includes(profile.role);
  const { data: resident } = await supabase
    .from('residents')
    .select(isStaff ? '*, homes(id, name)' : 'id, first_name, last_name, preferred_name, status, homes(id, name)')
    .eq('id', id)
    .maybeSingle();

  // Not allowed to see them = looks the same as not existing.
  if (!resident) notFound();

  const { data: appts } = await supabase
    .from('appointments')
    .select('id, title, category, appt_date, start_time, location')
    .eq('resident_id', id).gte('appt_date', todayISO()).neq('status', 'Cancelled')
    .order('appt_date').order('start_time').limit(5);

  const { data: notes } = await supabase
    .from('shift_notes')
    .select('id, note_date, shift, mood, meals, activities, note, share_with_family, signed_at, author_id, profiles(full_name)')
    .eq('resident_id', id)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <main>
      {isStaff && resident.homes && (
        <p className="small"><Link href={`/homes/${resident.homes.id}`}>← {resident.homes.name}</Link></p>
      )}
      <div className="title-row">
        <h1>
          {resident.first_name} {resident.last_name}
          {resident.preferred_name && <span className="muted"> ("{resident.preferred_name}")</span>}
        </h1>
        {canEdit && <Link className="button secondary" href={`/residents/${id}/edit`}>Edit profile</Link>}
      </div>
      <p className="muted">
        {resident.homes?.name} · {resident.status}
        {resident.care_type && ` · ${resident.care_type}`}
        {resident.date_of_birth && ` · age ${age(resident.date_of_birth)}`}
        {resident.admission_date && ` · admitted ${fmtDate(resident.admission_date)}`}
      </p>
      {isStaff && resident.allergies && (
        <p className="alert">Allergies: {resident.allergies}</p>
      )}

      {isStaff && (
        <details className="card">
          <summary><strong>Profile</strong> <span className="muted small">— contacts, health, funding</span></summary>
          <dl className="facts">
            <Fact label="Funder" value={[resident.funder, resident.file_number && `File ${resident.file_number}`].filter(Boolean).join(' · ')} />
            <Fact label="Social worker / facilitator" value={[resident.case_worker_name, resident.case_worker_phone, resident.case_worker_email].filter(Boolean).join(' · ')} />
            <Fact label="Guardian" value={[resident.guardian_name, resident.guardian_relationship, resident.guardian_phone].filter(Boolean).join(' · ')} />
            <Fact label="Emergency contact" value={[resident.emergency_contact_name, resident.emergency_contact_phone].filter(Boolean).join(' · ')} />
            <Fact label="PHN" value={resident.phn} />
            <Fact label="Family doctor" value={[resident.doctor_name, resident.doctor_phone].filter(Boolean).join(' · ')} />
            <Fact label="Diagnoses" value={resident.diagnoses} />
            <Fact label="Medications" value={resident.medications_summary} />
            <Fact label="Dietary needs" value={resident.dietary_needs} />
            <Fact label="School / day program" value={resident.school_or_day_program} />
            <Fact label="Behaviour support" value={resident.behaviour_support_notes} />
            <Fact label="Care plan review" value={resident.care_plan_review_date && fmtDate(resident.care_plan_review_date)} />
            <Fact label="Notes" value={resident.profile_notes} />
          </dl>
        </details>
      )}

      {appts?.length > 0 && (
        <>
          <h2>Upcoming</h2>
          <ul className="agenda">
            {appts.map((a) => (
              <li key={a.id}>
                <span className="when">{fmtDate(a.appt_date)}{a.start_time && ` · ${fmtTime(a.start_time)}`}</span>
                <span><strong>{a.title}</strong><span className="muted small"> · {a.category}{a.location && ` · ${a.location}`}</span></span>
              </li>
            ))}
          </ul>
        </>
      )}
      {isStaff && resident.homes && (
        <p className="small">
          <Link href={`/calendar?home=${resident.homes.id}&resident=${id}`}>+ Add an appointment for {resident.preferred_name || resident.first_name}</Link>
        </p>
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
