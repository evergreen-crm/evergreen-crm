// One staff member's HR record: details, certifications, training.
import Link from 'next/link';
import { personLabel, canHR } from '@/lib/levels';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { CERT_TYPES, certStatus } from '@/lib/hr';
import { trainingsFor } from '@/lib/onboarding';
import ProgramBadge from '@/app/components/ProgramBadge';
import { fmtDate, todayISO } from '@/lib/options';
import { cardStatus } from '@/lib/idcard';
import { reviewIdPhoto, issueIdCard, replaceIdQr } from '@/app/id/actions';
import {
  saveStaffDetails, addCertification, deleteCertification, addTraining, deleteTraining, saveEmployment,
} from '@/app/hr/actions';

export default async function StaffHrPage({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const canEdit = canHR(profile);

  const [{ data: person }, { data: details }, { data: certs }, { data: trainings }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, role, level, active, homes(name)').eq('id', id).maybeSingle(),
    supabase.from('staff_details').select('*').eq('profile_id', id).maybeSingle(),
    supabase.from('certifications').select('*').eq('profile_id', id).order('expires_on', { ascending: true, nullsFirst: false }),
    supabase.from('trainings').select('*').eq('profile_id', id).order('completed_on', { ascending: false }),
  ]);
  const { data: onb } = await supabase.from('onboardings').select('status').eq('profile_id', id).maybeSingle();
  const { data: onbItems } = onb ? await supabase.from('onboarding_items').select('status').eq('profile_id', id) : { data: [] };
  const onbDone = (onbItems ?? []).filter((i) => ['Verified', 'N/A'].includes(i.status)).length;
  const onbWaiting = (onbItems ?? []).filter((i) => i.status === 'Submitted').length;
  const { data: idCard } = await supabase.from('id_cards').select('*').eq('profile_id', id).maybeSingle();
  let idPhoto = null;
  if (idCard?.photo_path) {
    const { data } = await supabase.storage.from('id-photos').createSignedUrl(idCard.photo_path, 3600);
    idPhoto = data?.signedUrl ?? null;
  }
  let idNewPhoto = null;
  if (idCard?.new_photo_path && idCard.new_photo_status === 'Pending') {
    const { data } = await supabase.storage.from('id-photos').createSignedUrl(idCard.new_photo_path, 3600);
    idNewPhoto = data?.signedUrl ?? null;
  }

  // Staff can only open their own record (the database also enforces this).
  if (!person) notFound();

  return (
    <main>
      {canEdit && <p className="small"><Link href="/hr">← All staff</Link></p>}
      <h1>{person.full_name}</h1>
      <p className="muted">
        {personLabel(person)} · {person.homes?.name ?? 'No home'} · {[person.email, person.phone].filter(Boolean).join(' · ')}
        {!person.active && <span className="badge bad"> Access turned off</span>}
      </p>
      <p className="small">
        <span className="emp-no">Employee no. {details?.employee_no ?? '—'}</span>{' '}
        <ProgramBadge program={details?.program} />{' '}
        <span className={`badge ${details?.employment_status && details.employment_status !== 'Active' ? 'warn' : ''}`}>{details?.employment_status ?? 'Active'}</span>
        {details?.last_day && <span className="muted"> · last day {fmtDate(details.last_day)}</span>}
        {' · '}<Link href="/academy">🎓 Evergreen Academy</Link>
      </p>

      {/* ---------- Onboarding ---------- */}
      <div className="card onb-card">
        <div className="title-row">
          <h2>Onboarding</h2>
          {canEdit && (
            <Link className="button" href={`/hr/${person.id}/onboarding`}>{onb ? 'Open checklist' : 'Send onboarding request'}</Link>
          )}
          {!canEdit && onb && <Link className="button" href="/onboarding">Open my checklist</Link>}
        </div>
        {onb ? (
          <p className="small">Status: <span className="badge">{onb.status}</span> · {onbDone} of {onbItems?.length ?? 0} items complete
            {canEdit && onbWaiting > 0 && <> · <span className="badge warn">{onbWaiting} waiting for review</span></>}</p>
        ) : <p className="muted small">No onboarding checklist yet.</p>}
        <p className="small"><Link href={`/hr/${person.id}/certificates`}>🏅 Print all training certificates</Link>
          {canEdit && <> · <Link href={`/policies/report?person=${person.id}`}>📘 Print policy sign-off record</Link></>}</p>
      </div>


      {/* ---------- Digital ID card ---------- */}
      <div className="card" id="id-card">
        <div className="title-row">
          <h2>Digital ID card</h2>
          <Link className="button secondary" href={canEdit ? `/id?person=${person.id}` : '/id'}>Open card</Link>
        </div>
        {sp.idmsg && <p className={`message ${sp.idok ? 'ok' : ''}`}>{sp.idmsg}</p>}
        {(() => {
          const st = cardStatus({ card: idCard, details, active: person.active, today: todayISO() });
          return (
            <div className="id-admin">
              <div className="id-admin-photo">{idPhoto ? <img src={idPhoto} alt="" /> : <span className="muted small">No photo</span>}</div>
              <div>
                <p className="small">Card: <span className={`badge ${st === 'Valid' ? '' : st === 'Not issued' ? 'warn' : 'bad'}`}>{st}</span>
                  {idCard?.issued_on && <> · issued {fmtDate(idCard.issued_on)} · valid until {fmtDate(idCard.expires_on)}</>}
                  {' · '}Photo: {idCard?.photo_status ?? 'None'}
                  {' · '}Location notice: {idCard?.location_ack_at ? 'read' : 'not yet'}</p>
                {canEdit && idCard?.new_photo_status === 'Pending' && (
                  <div className="card">
                    <p className="small"><strong>New photo sent.</strong> Current photo (left) stays on the card until you approve the new one (right).</p>
                    <div className="row">
                      <div className="id-admin-photo">{idPhoto && <img src={idPhoto} alt="Current" />}</div>
                      <span>→</span>
                      <div className="id-admin-photo">{idNewPhoto && <img src={idNewPhoto} alt="New" />}</div>
                    </div>
                    <form action={reviewIdPhoto} className="row">
                      <input type="hidden" name="profile_id" value={person.id} />
                      <input name="note" placeholder="Note (needed to send back)" />
                      <button name="decision" value="approve">✓ Approve new photo</button>
                      <button name="decision" value="return" className="secondary">Keep old photo</button>
                    </form>
                  </div>
                )}
                {canEdit && idCard?.photo_status === 'Pending' && (
                  <form action={reviewIdPhoto} className="id-step">
                    <p className="small"><strong>Step 1 – check the photo</strong> (left). If it’s clear, approve and issue the card in one step.</p>
                    <input type="hidden" name="profile_id" value={person.id} />
                    <div className="row">
                      <label>Card valid for<select name="months" defaultValue="12"><option value="12">1 year</option><option value="24">2 years</option><option value="6">6 months</option></select></label>
                      <button name="decision" value="approve_issue">✓ Approve photo &amp; issue card</button>
                    </div>
                    <div className="row">
                      <input name="note" placeholder="What to fix (e.g., face too small, too dark)" />
                      <button name="decision" value="return" className="secondary">Ask for a new photo</button>
                    </div>
                  </form>
                )}
                {canEdit && idCard?.photo_status === 'Returned' && <p className="small muted">Waiting for {person.full_name} to send a new photo.</p>}
                {canEdit && idCard?.photo_status === 'Approved' && (
                  <form action={issueIdCard} className="row id-step">
                    <input type="hidden" name="profile_id" value={person.id} />
                    <label>Valid for<select name="months" defaultValue="12"><option value="12">1 year</option><option value="24">2 years</option><option value="6">6 months</option></select></label>
                    <button>{idCard.issued_on ? 'Renew card from today' : 'Issue card'}</button>
                  </form>
                )}
                {canEdit && idCard?.issued_on && (
                  <form action={replaceIdQr}>
                    <input type="hidden" name="profile_id" value={person.id} />
                    <button className="link small">Lost card or phone? Replace the QR code (the old one stops working)</button>
                  </form>
                )}
                {!idCard?.photo_path && <p className="muted small">The staff member adds their photo from <strong>My ID card</strong>. The card stops working automatically when their status is not Active.</p>}
              </div>
            </div>
          );
        })()}
      </div>

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
            <label>Program
              <select name="program" defaultValue={details?.program ?? 'Both'}>
                <option value="MCFD">MCFD only — children & youth</option>
                <option value="CLBC">CLBC only — adults</option>
                <option value="Both">Both MCFD and CLBC</option>
              </select>
            </label>
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

      {/* ---------- Employment status / resignation ---------- */}
      {canEdit && (
        <details className="card" open={!!details?.employment_status && details.employment_status !== 'Active'}>
          <summary><strong>Employment status, resignation or leaving</strong></summary>
          <form action={saveEmployment}>
            <input type="hidden" name="profile_id" value={person.id} />
            <div className="row">
              <label>Status
                <select name="employment_status" defaultValue={details?.employment_status ?? 'Active'}>
                  {['Active', 'On leave', 'Resigned', 'Terminated', 'Retired'].map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label>Date of resignation (notice given)<input type="date" name="resignation_date" defaultValue={details?.resignation_date ?? ''} /></label>
              <label>Last day of work<input type="date" name="last_day" defaultValue={details?.last_day ?? ''} /></label>
            </div>
            <div className="row">
              <label>Reason<input name="separation_reason" defaultValue={details?.separation_reason ?? ''} placeholder="e.g., moved, school, new job" /></label>
              <label>Eligible for rehire
                <select name="rehire_eligible" defaultValue={details?.rehire_eligible ?? ''}><option value="">—</option><option>Yes</option><option>No</option><option>With conditions</option></select>
              </label>
              <label>Exit interview date<input type="date" name="exit_interview_on" defaultValue={details?.exit_interview_on ?? ''} /></label>
            </div>
            {profile.role === 'admin' && person.active && <label className="check"><input type="checkbox" name="turn_off_access" /> Turn off their sign-in now</label>}
            {profile.role === 'admin' && !person.active && <label className="check"><input type="checkbox" name="turn_on_access" /> Turn their sign-in back on</label>}
            <button>Save</button>
            <p className="muted small">Personnel file items 11–13 (MCFD Standard G.1): dates of commencement and termination, rehire recommendation, exit interview record.</p>
          </form>
        </details>
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

      {/* ---------- Required training (MCFD policy 5.3) ---------- */}
      <h2>Required training</h2>
      {!details?.hire_date && <p className="muted small">Add a hire date above to see due dates.</p>}
      <ul className="checklist card">
        {trainingsFor(details?.program).filter((t) => !t.ifApplicable).map((rt) => {
          const done = trainings?.find((t) => t.title.toLowerCase() === rt.title.toLowerCase());
          let due = null;
          if (details?.hire_date) {
            const d = new Date(details.hire_date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + rt.days);
            due = d.toISOString().slice(0, 10);
          }
          const overdue = !done && due && due < todayISO();
          return (
            <li key={rt.title} className={done ? 'done' : overdue ? 'overdue' : ''}>
              <div className="req-text">
                <span className="tick">{done ? '✓' : overdue ? '!' : '○'}</span>
                <span><ProgramBadge program={rt.program} /> {rt.title}
                  <div className="muted small">
                    {done ? `Completed ${fmtDate(done.completed_on)}` : due ? `Due ${fmtDate(due)}${rt.days === 0 ? ' (before first shift)' : ` (within ${rt.days} days of hire)`}` : ''}
                    {overdue && <span className="badge bad">Overdue</span>}
                  </div>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted small">From Evergreen’s training matrix, filtered to this person’s program. Items that only apply to some roles (OFA 2, medication, working alone, driving) are tracked in onboarding. Record completions below using the exact training name.</p>

      {/* ---------- Training ---------- */}
      <h2>Training</h2>
      {trainings?.length === 0 && <p className="muted">No training recorded.</p>}
      {trainings?.length > 0 && (
        <table>
          <thead><tr><th>Training</th><th>Completed</th><th>Hours</th><th>Certificate</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {trainings.map((t) => (
              <tr key={t.id}>
                <td>{t.title}{t.notes && <div className="muted small">{t.notes}</div>}</td>
                <td>{t.completed_on}</td>
                <td>{t.hours ?? '—'}</td>
                <td><Link href={`/hr/certificate/${t.id}`}>🏅 View</Link></td>
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
            <label>Training<input name="title" required list="required-training" placeholder="Pick or type a training" /></label>
            <datalist id="required-training">{REQUIRED_TRAINING.map((t) => <option key={t.title} value={t.title} />)}</datalist>
            <label>Completed on<input type="date" name="completed_on" required /></label>
            <label>Hours<input type="number" step="0.5" min="0" name="hours" /></label>
          </div>
          <div className="row">
            <label>Provider<input name="provider" /></label>
            <label>Expiry (blank = automatic renewal date)<input type="date" name="expires_on" /></label>
          </div>
          <label>Notes<input name="notes" /></label>
          <button>Add training (verified)</button>
        </form>
      )}
    </main>
  );
}
