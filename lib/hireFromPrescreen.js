// Hire from a pre-screening file (Nov 20, 2026): runs with the server key right after the staff account is made.
//  1. Link the screening file to the new staff account (the hiring record: application, interview, references).
//  2. Certificates the applicant ticked "I have it" go into the staff file as training records "to verify",
//     with their uploaded photo or PDF copied into the staff file, so expiry reminders start right away.
//  3. Start onboarding: the checklist and the training plan with due dates, which opens the 6-day orientation.
//     Anything they ticked "Not yet" (NVCI, medication, WHMIS, FoodSafe...) shows as due in that plan.
//  4. Probation reviews are booked from the first day.
//  5. Their online job application, if there is one, is marked Hired.
import 'server-only';
import { createOnboarding } from '@/lib/onboardingStart';
import { todayISO } from '@/lib/options';

// Pre-screen checklist item -> the training title used in the staff file and the Academy matrix.
const CERT_TITLES = {
  firstaid: 'First Aid / CPR Level C',
  crisis: 'Non-Violent Crisis Intervention (NVCI)',
  meds: 'Medication Administration',
  whmis: 'WHMIS 2015',
  foodsafe: 'FoodSafe Level 1',
  licence: 'BC driver’s licence',
  edu: 'Diploma / certificate (education)',
};

export async function hireFromPrescreen(admin, { psId, userId, hiredBy, hireDate }) {
  const { data: p } = await admin.from('prescreens').select('id, profile_id, program, application, cert_files, application_no, first_name')
    .eq('id', psId).maybeSingle();
  if (!p) return ' The screening file was not found, so nothing was copied from it.';
  if (p.profile_id) return ' The screening file is already linked to another staff account.';
  const notes = [];

  const { error: le } = await admin.from('prescreens').update({ profile_id: userId, hired_at: new Date().toISOString(), hired_by: hiredBy }).eq('id', psId);
  if (le) return ` The screening file could not be linked (${le.message}).`;
  notes.push(`Screening file ${p.application_no ?? ''} linked as their hiring record.`.replace('  ', ' '));

  // Certificates, with their files.
  const check = p.application?.check ?? {};
  const files = p.cert_files ?? [];
  const rows = [];
  for (const [k, title] of Object.entries(CERT_TITLES)) {
    if (check[k]?.status !== 'yes') continue;
    const f = files.find((x) => x.key === k);
    let filePath = null;
    if (f?.path) {
      const { data: blob } = await admin.storage.from('applications').download(f.path);
      if (blob) {
        const dest = `${userId}/prescreen-${k}-${crypto.randomUUID()}-${(f.name ?? 'certificate').replace(/[^\w.\-]+/g, '_')}`.slice(0, 250);
        const { error: ue } = await admin.storage.from('staff-files').upload(dest, blob, { contentType: blob.type || undefined });
        if (!ue) filePath = dest;
      }
    }
    rows.push({ profile_id: userId, title, completed_on: todayISO(), expires_on: /^\d{4}-\d{2}-\d{2}$/.test(check[k]?.exp ?? '') ? check[k].exp : null,
      file_path: filePath, created_by: hiredBy, notes: `From pre-screen ${p.application_no ?? ''}: check the original and verify.` });
  }
  if (rows.length) {
    const { error: te } = await admin.from('trainings').insert(rows);
    notes.push(te ? `Certificates could not be copied (${te.message}).` : `${rows.length} certificate${rows.length === 1 ? '' : 's'} copied into the staff file to verify.`);
  }

  // Onboarding + training plan + orientation.
  const hire = /^\d{4}-\d{2}-\d{2}$/.test(hireDate ?? '') ? hireDate : todayISO();
  const onb = await createOnboarding(admin, { profileId: userId, hire, program: ['MCFD', 'CLBC', 'Both'].includes(p.program) ? p.program : 'Both', sentBy: hiredBy });
  notes.push(onb.error ? `Onboarding could not be started (${onb.error}).` : 'Onboarding checklist, training plan and 6-day orientation started.');

  // Probation: book the reviews from the first day (the 30-day review also ticks Competency on the screening file).
  const { data: sd } = await admin.from('staff_details').select('position').eq('profile_id', userId).maybeSingle();
  const { error: pe } = await admin.from('staff_probation').insert({ staff_id: userId, hire_date: hire, position: sd?.position ?? null });
  if (!pe) notes.push('Probation reviews booked.');

  // Their online application, if any.
  await admin.from('job_applications').update({ profile_id: userId, status: 'Hired' }).eq('prescreen_id', psId).is('profile_id', null);

  return ' ' + notes.join(' ');
}
