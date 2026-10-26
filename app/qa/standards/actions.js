'use server';
// COA standards tracker: add a standard, update its status, attach evidence (a link or an uploaded file).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canSeeQa } from '@/lib/qa';

const t = (f, k, n = 2000) => { const v = f.get(k); return typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null; };
const STATUSES = ['Not started', 'In progress', 'Met', 'Partially met', 'Not met', 'N/A'];
async function gate() { const r = await requireUser(['admin', 'manager']); if (!canSeeQa(r.profile)) redirect('/'); return r; }
const back = (msg, bad, id) => redirect(`/qa/standards?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}${id ? `#s-${id}` : ''}`);

export async function addStandard(formData) {
  const { supabase } = await gate();
  const area = t(formData, 'area', 10), code = t(formData, 'code', 30), title = t(formData, 'title', 300);
  if (!area || !code || !title) back('Enter the standard number and its title.', true);
  const { error } = await supabase.from('qa_standards').insert({ area, code, title, due_date: t(formData, 'due_date', 10), owner_id: t(formData, 'owner_id', 40) });
  if (error) back(/duplicate/i.test(error.message) ? `${code} is already in the list.` : error.message, true);
  revalidatePath('/qa/standards'); back(`Added ${code}.`);
}

export async function updateStandard(formData) {
  const { supabase, user } = await gate();
  const id = t(formData, 'id', 40);
  const status = STATUSES.includes(t(formData, 'status')) ? t(formData, 'status') : 'Not started';
  const { error } = await supabase.from('qa_standards').update({
    status, owner_id: t(formData, 'owner_id', 40), due_date: t(formData, 'due_date', 10), notes: t(formData, 'notes', 4000),
    updated_by: user.id, updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) back(error.message, true, id);
  revalidatePath('/qa/standards'); back('Saved.', false, id);
}

export async function addEvidence(p) {
  const { supabase } = await gate();
  const title = String(p?.title ?? '').trim().slice(0, 300);
  const link = String(p?.link ?? '').trim().slice(0, 500) || null;
  if (!title) return { error: 'Give the evidence a short title.' };
  if (!link && !p?.file_path) return { error: 'Add a link or choose a file.' };
  if (link && !/^(\/|https?:\/\/)/.test(link)) return { error: 'Links start with / (a CRM page) or https://' };
  const { error } = await supabase.from('qa_evidence').insert({ standard_id: p.standard_id, title, link, file_path: p.file_path ?? null, file_name: p.file_name ?? null });
  if (error) return { error: error.message };
  revalidatePath('/qa/standards');
  return { ok: true };
}

export async function removeEvidence(formData) {
  const { supabase } = await gate();
  const id = t(formData, 'id', 40);
  await supabase.from('qa_evidence').delete().eq('id', id);
  revalidatePath('/qa/standards'); back('Evidence removed.');
}
