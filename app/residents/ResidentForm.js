// The full resident profile form, used for "Add resident" and "Edit".
import Link from 'next/link';
import { CARE_TYPES, FUNDERS, RESIDENT_STATUSES } from '@/lib/options';

export default function ResidentForm({ action, resident = {}, homes, homeId, cancelHref }) {
  const v = (k) => resident[k] ?? '';
  return (
    <form action={action} className="stack">
      {resident.id && <input type="hidden" name="id" value={resident.id} />}

      <fieldset className="card">
        <legend>Basic information</legend>
        <div className="row">
          <label>First name<input name="first_name" required defaultValue={v('first_name')} /></label>
          <label>Last name<input name="last_name" required defaultValue={v('last_name')} /></label>
          <label>Preferred name<input name="preferred_name" defaultValue={v('preferred_name')} /></label>
        </div>
        <div className="row">
          <label>Date of birth<input type="date" name="date_of_birth" defaultValue={v('date_of_birth')} /></label>
          <label>Gender<input name="gender" defaultValue={v('gender')} /></label>
          <label>
            Care type
            <select name="care_type" defaultValue={v('care_type') || 'Adult'}>
              {CARE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label>
            House
            <select name="home_id" required defaultValue={v('home_id') || homeId || ''}>
              <option value="" disabled>Pick a house</option>
              {homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={v('status') || 'active'}>
              {RESIDENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label>Admission date<input type="date" name="admission_date" defaultValue={v('admission_date')} /></label>
          <label>Discharge date<input type="date" name="discharge_date" defaultValue={v('discharge_date')} /></label>
          <label>Care plan review date<input type="date" name="care_plan_review_date" defaultValue={v('care_plan_review_date')} /></label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Checklist settings</legend>
        <p className="muted small">These switch on extra MCFD / CLBC requirement items.</p>
        <label className="check"><input type="checkbox" name="is_indigenous" defaultChecked={!!resident.is_indigenous} /> Indigenous (Cultural Plan and Nation notification required)</label>
        <label className="check"><input type="checkbox" name="has_bsp" defaultChecked={!!resident.has_bsp} /> Has a Behaviour Support / Safety Plan</label>
        <label className="check"><input type="checkbox" name="on_medication" defaultChecked={!!resident.on_medication} /> Takes medication (MAR required)</label>
      </fieldset>

      <fieldset className="card">
        <legend>Funding &amp; case worker</legend>
        <div className="row">
          <label>
            Funder
            <select name="funder" defaultValue={v('funder')}>
              <option value="">—</option>
              {FUNDERS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label>File number<input name="file_number" defaultValue={v('file_number')} /></label>
        </div>
        <div className="row">
          <label>Social worker / facilitator<input name="case_worker_name" defaultValue={v('case_worker_name')} /></label>
          <label>Phone<input type="tel" name="case_worker_phone" defaultValue={v('case_worker_phone')} /></label>
          <label>Email<input type="email" name="case_worker_email" defaultValue={v('case_worker_email')} /></label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Guardian &amp; emergency contact</legend>
        <div className="row">
          <label>Guardian / representative<input name="guardian_name" defaultValue={v('guardian_name')} /></label>
          <label>Relationship<input name="guardian_relationship" defaultValue={v('guardian_relationship')} placeholder="e.g., parent, MCFD, rep agreement" /></label>
          <label>Phone<input type="tel" name="guardian_phone" defaultValue={v('guardian_phone')} /></label>
        </div>
        <div className="row">
          <label>Emergency contact<input name="emergency_contact_name" defaultValue={v('emergency_contact_name')} /></label>
          <label>Phone<input type="tel" name="emergency_contact_phone" defaultValue={v('emergency_contact_phone')} /></label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Health</legend>
        <div className="row">
          <label>Personal Health Number (PHN)<input name="phn" defaultValue={v('phn')} /></label>
          <label>Family doctor<input name="doctor_name" defaultValue={v('doctor_name')} /></label>
          <label>Doctor phone<input type="tel" name="doctor_phone" defaultValue={v('doctor_phone')} /></label>
        </div>
        <label>Allergies<input name="allergies" defaultValue={v('allergies')} placeholder="Leave blank if none known" /></label>
        <label>Diagnoses / conditions<textarea name="diagnoses" rows={2} defaultValue={v('diagnoses')} /></label>
        <label>Medications (summary)<textarea name="medications_summary" rows={2} defaultValue={v('medications_summary')} /></label>
        <label>Dietary needs<input name="dietary_needs" defaultValue={v('dietary_needs')} /></label>
      </fieldset>

      <fieldset className="card">
        <legend>Daily life &amp; support</legend>
        <label>School / day program<input name="school_or_day_program" defaultValue={v('school_or_day_program')} /></label>
        <label>Behaviour support notes<textarea name="behaviour_support_notes" rows={3} defaultValue={v('behaviour_support_notes')} /></label>
        <label>Other notes<textarea name="profile_notes" rows={3} defaultValue={v('profile_notes')} /></label>
      </fieldset>

      <div className="row">
        <button>{resident.id ? 'Save changes' : 'Add resident'}</button>
        <Link className="button secondary" href={cancelHref}>Cancel</Link>
      </div>
    </form>
  );
}
