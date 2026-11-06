'use server';
// Orientation sign-offs by the Program Coordinator (or PM, HR, directors). The database (orientation_tick) checks
// who may sign, keeps the days in order, and issues the one orientation certificate when the last step is done.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { savePaperworkPdf } from '@/lib/paperworkPdf';
import { fmtDate } from '@/lib/options';

export async function tickStep(formData) {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const p = String(formData.get('p') ?? '');
  const item = String(formData.get('item') ?? '');
  const done = formData.get('done') === '1';
  const note = String(formData.get('note') ?? '').trim().slice(0, 300) || null;
  const back = (q) => redirect(`/orientation?p=${encodeURIComponent(p)}&${q}#i-${item}`);
  const { data, error } = await supabase.rpc('orientation_tick', { p, p_item: item, p_done: done, p_note: note });
  if (error) back('error=' + encodeURIComponent(error.message));
  if (data?.complete) await certificatePdf(supabase, p, profile.full_name);
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
  if (!person || !c?.training_id) return;
  const days = [...new Set((steps ?? []).map((s) => s.day_number))].sort((a, b) => a - b);
  const lines = [
    `This certifies that ${person.full_name} completed the Evergreen New Staff Orientation (6 days, 33 paid hours), including every Evergreen Academy course and final quiz, and every in-person step.`,
    `Certificate number: ${c.certificate_no}`,
    ...days.map((d) => `Day ${d}: ` + (steps ?? []).filter((s) => s.day_number === d && s.kind !== 'lunch')
      .map((s) => `${s.title} (${s.score ? `passed ${s.score}` : s.done_how?.replace('Signed off by ', 'signed: ') ?? 'done'}${s.done_at ? `, ${fmtDate(s.done_at.slice(0, 10))}` : ''})`).join('; ') + '.'),
    `Final sign-off by ${signer}.`,
  ];
  await savePaperworkPdf({ person, kind: 'course', sourceId: c.training_id, title: 'Certificate: Evergreen New Staff Orientation', lines, at: c.completed_at });
}
