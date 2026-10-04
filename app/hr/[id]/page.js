// One staff member's HR record: details, certifications, training.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { CERT_TYPES, certStatus } from '@/lib/hr';
import {
  saveStaffDetails, addCertification, deleteCertification, addTraining, deleteTraining,
} from '@/app/hr/actions';

export default async function StaffHrPage({ params }) {
  const { id } = await params;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const canEdit = ['admin', 'manager'].includes(profile.role);

  const [{ data: person }, { data: details }, { data: certs }, { data: trainings }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, role, active, homes(name)').eq('id', id).maybeSingle(),
    supabase.from('staff_details').select('*').eq('profile_id', id).maybeSingle(),
    supabase.from('certifications').select('*').eq('profile_id', id).order('expires_on', { ascending: true, nullsFirst: false }),
    supabase.from('trainings').select('*').eq('profile_id', id).order('completed_on', { ascending: false }),
  ]);

  // Staff can only open their own record (the database also enforces this).
  if (!person) notFound();

  return (
    <main>
      {canEdit && <p className="small"><Link href="/hr">← All staff</Link></p>}
      <h1>{person.full_name}</h1>
      <p className="muted">
        {person.role} · {person.homes?.name ?? 'No home'} · {[person.email, person.phone].filter(Boolean).join(' · ')}
        {!person.active && <span className="badge bad"> Access turned off</span>}
      </p>

      {/* ---------- Details ---------- */}
      <h2>Details</h2>
      {canEdit ? (
        <form action={saveStaffDetails} className="card">
          <input type="hidden" name="profile_id" value={person.id} />
          <div className="row">
            <label>Position<input name="position" defaultValue={details?.position ?? ''} placeholder="e.g., Support Worker" /></label>
            <label>
              Employment type
              <select name="employment_type" defaultValue={details?.employment_type ?? ''}>
                <option value="">—</option>
                <option>Full-time</option>
                <option>Part-time</option>
                <option>Casual</option>
              </select>
            </label>
            <label>Hire date<input type="date" name="hire_date" defaultValue={details?.hire_date ?? ''} /></label>
          </div>
          <div className="row">
            <label>Emergency contact<input name="emergency_contact" defaultValue={details?.emergency_contact ?? ''} /></label>
            <label>Emergency phone<input name="emergency_phone" defaultValue={details?.emergency_phone ?? ''} /></label>
          </div>
          <label>Notes<textarea name="notes" rows={2} defaultValue={details?.notes ?? ''} /></label>
          <button>Save details</button>
        </form>
      ) : (
        <div className="card">
          <p>Position: {details?.position ?? '—'} {details?.employment_type && `(${details.employment_type})`}</p>
          <p>Hire date: {details?.hire_date ?? '—'}</p>
          <p>Emergency contact: {details?.emergency_contact ?? '—'} {details?.emergency_phone}</p>
        </div>
      )}

      {/* ---------- Certifications ---------- */}
      <h2>Certifications</h2>
      {certs?.length === 0 && <p className="muted">No certificates on file.</p>}
      {certs?.length > 0 && (
        <table>
          <thead><tr><th>Certificate</th><th>Issued</th><th>Expires</th><th>Status</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {certs.map((c) => {
              const s = certStatus(c.expires_on);
              return (
                <tr key={c.id}>
                  <td>{c.cert_type}{c.notes && <div className="muted small">{c.notes}</div>}</td>
                  <td>{c.issued_on ?? '—'}</td>
                  <td>{c.expires_on ?? '—'}</td>
                  <td><span className={`badge ${s.key === 'expired' ? 'bad' : s.key === 'soon' ? 'warn' : ''}`}>{s.label}</span></td>
                  {canEdit && (
                    <td>
                      <form action={deleteCertification}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="profile_id" value={person.id} />
                        <button className="link small">Remove</button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {canEdit && (
        <form action={addCertification} className="card">
          <h3>Add a certificate</h3>
          <input type="hidden" name="profile_id" value={person.id} />
          <div className="row">
            <label>
              Type
              <select name="cert_type" required defaultValue={CERT_TYPES[0]}>
                {CERT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label>If "Other", name<input name="cert_other" /></label>
          </div>
          <div className="row">
            <label>Issued on<input type="date" name="issued_on" /></label>
            <label>Expires on<input type="date" name="expires_on" /></label>
          </div>
          <label>Notes<input name="notes" placeholder="e.g., certificate number, provider" /></label>
          <button>Add certificate</button>
        </form>
      )}

      {/* ---------- Training ---------- */}
      <h2>Training</h2>
      {trainings?.length === 0 && <p className="muted">No training recorded.</p>}
      {trainings?.length > 0 && (
        <table>
          <thead><tr><th>Training</th><th>Completed</th><th>Hours</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {trainings.map((t) => (
              <tr key={t.id}>
                <td>{t.title}{t.notes && <div className="muted small">{t.notes}</div>}</td>
                <td>{t.completed_on}</td>
                <td>{t.hours ?? '—'}</td>
                {canEdit && (
                  <td>
                    <form action={deleteTraining}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="profile_id" value={person.id} />
                      <button className="link small">Remove</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <form action={addTraining} className="card">
          <h3>Add training</h3>
          <input type="hidden" name="profile_id" value={person.id} />
          <div className="row">
            <label>Training<input name="title" required placeholder="e.g., New staff orientation" /></label>
            <label>Completed on<input type="date" name="completed_on" required /></label>
            <label>Hours<input type="number" step="0.5" min="0" name="hours" /></label>
          </div>
          <label>Notes<input name="notes" /></label>
          <button>Add training</button>
        </form>
      )}
    </main>
  );
}
