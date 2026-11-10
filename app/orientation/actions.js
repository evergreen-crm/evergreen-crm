'use server';
// Orientation sign-offs by the Program Coordinator (or PM, HR, directors). The database (orientation_tick) checks
// who may sign, keeps the days in order, and issues the one orientation certificate when the last step is done.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { savePaperworkPdf } from '@/lib/paperworkPdf';
import { fmtDate } from '@/lib/options';
import { sendEmail, emailReady } from '@/lib/email';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { welcomeEmail } from '@/lib/boardWelcome';

const SITE = (process.env.SITE_URL || 'https://evergreen-crm-azure.vercel.app').replace(/\/$/, '');

export async function tickStep(formData) {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const p = String(formData.get('p') ?? '');
  const item = String(formData.get('item') ?? '');
  const done = formData.get('done') === '1';
  const note = String(formData.get('note') ?? '').trim().slice(0, 300) || null;
  const back = (q) => redirect(`/orientation?p=${encodeURIComponent(p)}&${q}#i-${item}`);
  const { data, error } = await supabase.rpc('orientation_tick', { p, p_item: item, p_done: done, p_note: note });
  if (error) back('error=' + encodeURIComponent(error.message));
  if (data?.complete) {
    const pdf = await certificatePdf(supabase, p, profile.full_name);
    await boardWelcomeEmail(p, data.certificate_no, pdf?.id);
  }
  revalidatePath('/orientation');
  revalidatePath('/');
  back(data?.complete ? 'ok=' + encodeURIComponent(`Orientation complete. Certificate ${data.certificate_no} is in the staff file.`) : 'ok=Saved');
}

// One certificate for the whole orientation, kept as a PDF in the person's staff file.
async function certificatePdf(supabase, p, signer) {
  const [{ data: person }, { data: c }, { data: steps }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('id', p).maybeSingle(),
    supabase.from('orientation_completions').select('certificate_no, completed_at, training_id').eq('profile_id', p).maybeSingle(),
    supabase.rpc('orientation_plan_for', { p }),
  ]);
  if (!person || !c?.training_id) return null;
  const days = [...new Set((steps ?? []).map((s) => s.day_number))].sort((a, b) => a - b);
  const lines = [
    `This certifies that ${person.full_name} completed the Evergreen New Staff Orientation (6 days, 33 paid hours), including every Evergreen Academy course and final quiz, and every in-person step.`,
    `Certificate number: ${c.certificate_no}`,
    ...days.map((d) => `Day ${d}: ` + (steps ?? []).filter((s) => s.day_number === d && s.kind !== 'lunch')
      .map((s) => `${s.title} (${s.score ? `passed ${s.score}` : s.done_how?.replace('Signed off by ', 'signed: ') ?? 'done'}${s.done_at ? `, ${fmtDate(s.done_at.slice(0, 10))}` : ''})`).join('; ') + '.'),
    `Final sign-off by ${signer}.`,
  ];
  return savePaperworkPdf({ person, kind: 'course', sourceId: c.training_id, title: 'Certificate: Evergreen New Staff Orientation', lines, at: c.completed_at });
}

// The Board of Directors' welcome message, emailed once when the orientation is complete, with the certificate attached.
// It never blocks the sign-off: the same message is waiting on the person's screen (/orientation/welcome) either way.
async function boardWelcomeEmail(p, certificateNo, pdfId) {
  try {
    if (!emailReady() || !adminKey()) return;
    const admin = createAdminClient();
    const { data: person } = await admin.from('profiles').select('id, full_name, email, active').eq('id', p).maybeSingle();
    if (!person?.active) return;
    let to = person.email;
    if (!to) { const { data: au } = await admin.auth.admin.getUserById(p); to = au?.user?.email ?? null; }
    if (!to) return;
    let attachments;
    if (pdfId) {
      const { data: row } = await admin.from('paperwork_pdfs').select('file_path').eq('id', pdfId).maybeSingle();
      const { data: file } = row?.file_path ? await admin.storage.from('staff-files').download(row.file_path) : { data: null };
      if (file) attachments = [{ filename: `Evergreen-Orientation-Certificate-${certificateNo}.pdf`, content: Buffer.from(await file.arrayBuffer()).toString('base64') }];
    }
    const mail = welcomeEmail({ fullName: person.full_name, certificateNo: attachments ? certificateNo : null, href: `${SITE}/orientation/welcome` });
    await sendEmail({ to, ...mail, attachments });
  } catch {}
}

// The staff member accepts the Board's welcome message (recorded once, with the date, in orientation_completions).
export async function acceptWelcome(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  if (formData.get('agree') !== '1') redirect('/orientation/welcome?error=' + encodeURIComponent('Please tick the box to accept.'));
  const { error } = await supabase.rpc('orientation_welcome_ack');
  if (error) redirect('/orientation/welcome?error=' + encodeURIComponent(error.message));
  revalidatePath('/orientation');
  revalidatePath('/portal');
  redirect('/portal');
}
