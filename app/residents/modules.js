'use server';
// Medications (MAR), goals, documents and family messages: saving.
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { todayISO } from '@/lib/options';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};
const refresh = (id) => revalidatePath(`/residents/${id}`);

// ---------- Medications ----------
export async function addMedication(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager']);
  const residentId = text(formData, 'resident_id');
  const isPrn = formData.get('is_prn') === 'on';
  const times = isPrn ? [] : (text(formData, 'times') ?? '')
    .split(/[,\s]+/).filter(Boolean)
    .map((t) => { const [h, m = '00'] = t.split(':'); return `${String(Number(h)).padStart(2, '0')}:${m.padStart(2, '0').slice(0, 2)}`; })
    .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
    .sort();
  if (!isPrn && times.length === 0) throw new Error('Add at least one time (for example 08:00, 20:00), or tick "As needed (PRN)".');
  const { error } = await supabase.from('medications').insert({
    resident_id: residentId,
    name: text(formData, 'name'),
    dose: text(formData, 'dose'),
    route: text(formData, 'route'),
    times,
    is_prn: isPrn,
    instructions: text(formData, 'instructions'),
    prescriber: text(formData, 'prescriber'),
    start_date: text(formData, 'start_date'),
    created_by: user.id,
  });
  if (error) throw new Error('Could not add medication: ' + error.message);
  refresh(residentId);
}

export async function stopMedication(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const residentId = text(formData, 'resident_id');
  const active = formData.get('active') === 'true';
  const { error } = await supabase.from('medications')
    .update({ active, end_date: active ? null : todayISO() }).eq('id', text(formData, 'id'));
  if (error) throw new Error('Could not update medication: ' + error.message);
  refresh(residentId);
}

export async function recordDose(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const residentId = text(formData, 'resident_id');
  const status = text(formData, 'status');
  const reason = text(formData, 'reason');
  const prn = !text(formData, 'scheduled_time');
  if ((prn || status !== 'Given') && !reason) throw new Error(prn ? 'Please write why the PRN was given.' : `Please write a reason for "${status}".`);
  const { error } = await supabase.from('med_administrations').insert({
    medication_id: text(formData, 'medication_id'),
    resident_id: residentId,
    admin_date: text(formData, 'admin_date') ?? todayISO(),
    scheduled_time: text(formData, 'scheduled_time'),
    status,
    reason,
    given_by: user.id,
  });
  if (error) {
    if (error.code === '23505') throw new Error('This dose has already been signed for.');
    throw new Error('Could not save: ' + error.message);
  }
  refresh(residentId);
}

// ---------- Goals ----------
export async function addGoal(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager']);
  const residentId = text(formData, 'resident_id');
  const { error } = await supabase.from('goals').insert({
    resident_id: residentId,
    title: text(formData, 'title'),
    domain: text(formData, 'domain'),
    description: text(formData, 'description'),
    target_date: text(formData, 'target_date'),
    created_by: user.id,
  });
  if (error) throw new Error('Could not add goal: ' + error.message);
  refresh(residentId);
}

export async function setGoalStatus(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const residentId = text(formData, 'resident_id');
  const { error } = await supabase.from('goals').update({ status: text(formData, 'status') }).eq('id', text(formData, 'id'));
  if (error) throw new Error('Could not update goal: ' + error.message);
  refresh(residentId);
}

// ---------- Documents (the file itself is uploaded from the browser first) ----------
export async function addDocument(info) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.from('documents').insert({
    home_id: info.home_id,
    resident_id: info.resident_id ?? null,
    title: info.title,
    category: info.category ?? null,
    file_path: info.file_path,
    file_size: info.file_size ?? null,
    uploaded_by: user.id,
  });
  if (error) {
    await supabase.storage.from('documents').remove([info.file_path]);
    return { error: error.message };
  }
  if (info.resident_id) refresh(info.resident_id);
  return { ok: true };
}

export async function deleteDocument(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const residentId = text(formData, 'resident_id');
  const id = text(formData, 'id');
  const { data: doc } = await supabase.from('documents').select('file_path').eq('id', id).maybeSingle();
  if (doc) await supabase.storage.from('documents').remove([doc.file_path]);
  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) throw new Error('Could not remove: ' + error.message);
  if (residentId) refresh(residentId);
}

// ---------- Family messages ----------
export async function sendMessage(formData) {
  const { supabase, user } = await requireUser();
  const residentId = text(formData, 'resident_id');
  const body = text(formData, 'body');
  if (!body) return;
  const { error } = await supabase.from('messages').insert({ resident_id: residentId, sender_id: user.id, body });
  if (error) throw new Error('Could not send: ' + error.message);
  refresh(residentId);
}
