'use server';
// Portal: saving records and managing who has access to each division.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { findArea } from '@/lib/divisions';
import { addDaysISO } from '@/lib/options';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

export async function saveRecord(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const { div, area } = findArea(text(formData, 'division'), text(formData, 'area'));
  if (!area) throw new Error('Unknown area.');
  const id = text(formData, 'id');

  const data = {};
  for (const f of area.fields) {
    const v = text(formData, 'f_' + f.name);
    if (v !== null) data[f.name] = f.type === 'number' ? Number(v) : v;
  }
  const recordDate = text(formData, 'record_date');
  let due = text(formData, 'due_date');
  if (!id && !due && area.dueDays && recordDate) due = addDaysISO(recordDate, area.dueDays);

  const row = {
    record_type: text(formData, 'record_type'),
    title: text(formData, 'title'),
    record_date: recordDate,
    due_date: due,
    status: text(formData, 'status') ?? 'Open',
    home_id: text(formData, 'home_id'),
    resident_id: area.resident ? text(formData, 'resident_id') : null,
    data,
  };

  let recordId = id;
  if (id) {
    const { data: out, error } = await supabase.from('records')
      .update({ ...row, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', id).select('id');
    if (error) throw new Error('Could not save: ' + error.message);
    if (!out?.length) throw new Error('You do not have permission to edit this record.');
  } else {
    const { data: out, error } = await supabase.from('records').insert({
      ...row, division: div.key, area: area.key, visibility: area.staff ? 'staff' : 'managers', created_by: user.id,
    }).select('id').single();
    if (error) throw new Error('Could not save: ' + error.message);
    recordId = out.id;
  }
  revalidatePath(`/portal/${div.key}/${area.key}`);
  revalidatePath('/portal');
  if (id) redirect(`/portal/record/${recordId}`);
}

export async function setRecordStatus(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(formData, 'id');
  const { error } = await supabase.from('records')
    .update({ status: text(formData, 'status'), updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('Could not update: ' + error.message);
  revalidatePath(text(formData, 'path') ?? '/portal');
}

export async function deleteRecord(formData) {
  const { supabase } = await requireUser(['admin']);
  const { error } = await supabase.from('records').delete().eq('id', text(formData, 'id'));
  if (error) throw new Error('Could not remove: ' + error.message);
  redirect(text(formData, 'back') ?? '/portal');
}

export async function grantAccess(formData) {
  const { supabase, user } = await requireUser(['admin']);
  const division = text(formData, 'division');
  const { error } = await supabase.from('portal_access').upsert({
    profile_id: text(formData, 'profile_id'), division, can_edit: formData.get('can_edit') === 'on', granted_by: user.id,
  });
  if (error) throw new Error('Could not give access: ' + error.message);
  revalidatePath(`/portal/${division}`);
}

export async function revokeAccess(formData) {
  const { supabase } = await requireUser(['admin']);
  const division = text(formData, 'division');
  const { error } = await supabase.from('portal_access').delete()
    .eq('profile_id', text(formData, 'profile_id')).eq('division', division);
  if (error) throw new Error('Could not remove access: ' + error.message);
  revalidatePath(`/portal/${division}`);
}
