'use server';
// HR: job postings and applications (plan B5). HR does everything; the Administrator can too; the CEO can read.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canEditJobs } from '@/lib/jobsAccess';
import { STATUSES, EMPLOYMENT_TYPES, SHIFT_TEAMS } from '@/lib/jobs';
import { sendEmail } from '@/lib/email';
import { POSITIONS } from '@/lib/prescreen';

const t = (fd, k, max = 4000) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null; };
const num = (fd, k) => { const v = t(fd, k); const n = v === null ? null : Number(v.replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };

async function editor() {
  const r = await requireUser(['admin', 'manager', 'staff']);
  if (!canEditJobs(r.profile)) redirect('/hr/jobs?error=' + encodeURIComponent('Only HR or the Administrator can change job postings and applications.'));
  return r;
}

export async function savePosting(fd) {
  const { supabase, user } = await editor();
  const id = t(fd, 'id');
  const back = (q) => redirect(id ? `/hr/jobs/${id}?${q}` : `/hr/jobs?${q}#new`);
  const row = {
    title: t(fd, 'title', 120), position: t(fd, 'position', 120),
    program: ['MCFD', 'CLBC', 'Both'].includes(t(fd, 'program')) ? t(fd, 'program') : 'Both',
    location: t(fd, 'location', 120),
    employment_type: EMPLOYMENT_TYPES.includes(t(fd, 'employment_type')) ? t(fd, 'employment_type') : 'Full-time',
    shift_team: SHIFT_TEAMS.includes(t(fd, 'shift_team')) ? t(fd, 'shift_team') : null,
    hours_per_week: num(fd, 'hours_per_week'),
    wage_min: num(fd, 'wage_min'), wage_max: num(fd, 'wage_max') ?? num(fd, 'wage_min'),
    wage_unit: t(fd, 'wage_unit') === 'year' ? 'year' : 'hour',
    summary: t(fd, 'summary', 3000), duties: t(fd, 'duties'), requirements: t(fd, 'requirements'),
    drives: fd.get('drives') === 'on', closing_date: t(fd, 'closing_date'),
  };
  if (!row.title) back('error=' + encodeURIComponent('Enter a job title.'));
  if (row.wage_min && row.wage_max && row.wage_max < row.wage_min) back('error=' + encodeURIComponent('The top of the wage range is lower than the bottom.'));
  const { data, error } = id
    ? await supabase.from('job_postings').update(row).eq('id', id).select('id').single()
    : await supabase.from('job_postings').insert({ ...row, created_by: user.id }).select('id').single();
  if (error) back('error=' + encodeURIComponent(error.message.includes('wage_to_open') ? 'An open posting needs a wage range (B.C. pay transparency).' : error.message));
  revalidatePath('/hr/jobs'); revalidatePath('/jobs');
  redirect(`/hr/jobs/${data.id}?ok=${encodeURIComponent(id ? 'Posting saved.' : 'Posting created as a draft. Check it, then publish it.')}`);
}

export async function setPostingStatus(fd) {
  const { supabase, user } = await editor();
  const id = t(fd, 'id'); const status = t(fd, 'status');
  if (!['Draft', 'Open', 'Closed'].includes(status)) redirect(`/hr/jobs/${id}`);
  const patch = { status, ...(status === 'Open' ? { published_by: user.id, published_at: new Date().toISOString() } : {}) };
  const { error } = await supabase.from('job_postings').update(patch).eq('id', id);
  if (error) redirect(`/hr/jobs/${id}?error=${encodeURIComponent(error.message.includes('wage_to_open') ? 'Add the wage range before publishing (B.C. pay transparency rules require it on public postings).' : error.message)}`);
  revalidatePath('/hr/jobs'); revalidatePath('/jobs'); revalidatePath(`/hr/jobs/${id}`);
  redirect(`/hr/jobs/${id}?ok=${encodeURIComponent({ Open: 'Published. It is now on the Careers page.', Closed: 'Closed. It is no longer on the Careers page.', Draft: 'Moved back to draft.' }[status])}`);
}

export async function updateApplication(fd) {
  const { supabase } = await editor();
  const id = t(fd, 'id');
  const patch = {};
  const status = t(fd, 'status');
  if (status && STATUSES.includes(status)) patch.status = status;
  if (fd.has('hr_notes')) patch.hr_notes = t(fd, 'hr_notes', 6000);
  const { error } = await supabase.from('job_applications').update(patch).eq('id', id);
  if (error) redirect(`/hr/jobs/application/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/hr/jobs/application/${id}`); revalidatePath('/hr/jobs');
  redirect(`/hr/jobs/application/${id}?ok=${encodeURIComponent(status ? `Moved to ${status}.` : 'Notes saved.')}`);
}

// Pre-screening: open a pre-screening file already filled in with the applicant's details.
export async function startPrescreen(fd) {
  const { supabase } = await editor();
  const id = t(fd, 'id');
  const { data: a } = await supabase.from('job_applications').select('*, posting:posting_id(title, position, program, drives)').eq('id', id).maybeSingle();
  if (!a) redirect('/hr/jobs');
  if (a.prescreen_id) redirect(`/hr/prescreen/${a.prescreen_id}?tab=link`);
  const lived = a.answers?.prequal?.outside_bc === 'yes';
  const { data: ps, error } = await supabase.from('prescreens').insert({
    first_name: a.first_name, last_name: a.last_name, email: a.email, phone: a.phone,
    position: POSITIONS.includes(a.posting?.position) ? a.posting.position : null,
    program: a.posting?.program ?? 'Both', drives: !!a.posting?.drives, lived_outside: lived,
    token: (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, ''), require_code: true,
    file_notes: `From online application ${a.posting?.title ?? ''} (submitted ${a.submitted_at?.slice(0, 10) ?? ''}). References given: ${(a.answers?.refs ?? []).filter((r) => r?.name).map((r) => `${r.name} (${r.agency ?? ''}, ${r.email ?? ''})`).join('; ')}`.slice(0, 2000),
  }).select('id').single();
  if (error) redirect(`/hr/jobs/application/${id}?error=${encodeURIComponent('Could not open pre-screening: ' + error.message)}`);
  await supabase.from('job_applications').update({ prescreen_id: ps.id, status: 'Pre-screening' }).eq('id', id);
  revalidatePath('/hr/prescreen'); revalidatePath(`/hr/jobs/application/${id}`);
  redirect(`/hr/prescreen/${ps.id}?tab=link&ok=${encodeURIComponent('Pre-screening file opened with the applicant’s details. Send them the pre-screening link.')}`);
}

// Not selected: a polite email from HR (no personal name), after HR confirms.
export async function declineApplication(fd) {
  const { supabase } = await editor();
  const id = t(fd, 'id');
  if (fd.get('confirm') !== 'on') redirect(`/hr/jobs/application/${id}?error=${encodeURIComponent('Tick the box to confirm.')}#decline`);
  const { data: a } = await supabase.from('job_applications').select('id, first_name, email, status, decline_emailed_at, posting:posting_id(title, job_id)').eq('id', id).maybeSingle();
  if (!a) redirect('/hr/jobs');
  const { error } = await supabase.from('job_applications').update({ status: 'Not selected' }).eq('id', id);
  if (error) redirect(`/hr/jobs/application/${id}?error=${encodeURIComponent(error.message)}`);
  let note = 'Marked as not selected.';
  if (fd.get('send_email') === 'on' && !a.decline_emailed_at) {
    const r = await sendEmail({
      to: a.email,
      subject: `Your application to Evergreen Community Care — ${a.posting?.job_id ?? ''}`,
      text: `Hello ${a.first_name},\n\nThank you for your interest in the ${a.posting?.title} position (Job ID ${a.posting?.job_id}) and for the time you put into your application. After careful review, we have decided not to move forward with your application for this position.\n\nWe encourage you to apply for future openings on our Careers page.\n\nWe wish you all the best.\n\nEvergreen Community Care — HR`,
    });
    if (!r.error) { await supabase.from('job_applications').update({ decline_emailed_at: new Date().toISOString() }).eq('id', id); note += ' The email was sent.'; }
    else note += ` The email could not be sent (${r.error}).`;
  }
  revalidatePath(`/hr/jobs/application/${id}`); revalidatePath('/hr/jobs');
  redirect(`/hr/jobs/application/${id}?ok=${encodeURIComponent(note)}`);
}
