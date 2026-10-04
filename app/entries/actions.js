'use server';
// Saving any log entry (contact, health, behaviour, money, goal progress,
// communication book, fire drill, safety check).
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { ENTRY_TYPES } from '@/lib/entries';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

export async function saveEntry(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const kind = text(formData, 'kind');
  const type = ENTRY_TYPES[kind];
  if (!type) throw new Error('Unknown entry type.');

  const data = {};
  for (const f of type.fields) {
    const v = text(formData, f.name);
    if (f.required && v === null) throw new Error(`Please fill in "${f.label}".`);
    if (v !== null) data[f.name] = f.type === 'number' ? Number(v) : v;
  }

  let amount = null;
  if (kind === 'money') {
    amount = Math.abs(Number(data.amount)) * (data.type?.startsWith('Money out') ? -1 : 1);
    if (!Number.isFinite(amount) || amount === 0) throw new Error('Please enter an amount.');
  }

  const { error } = await supabase.from('entries').insert({
    kind,
    home_id: text(formData, 'home_id'),
    resident_id: type.scope === 'resident' ? text(formData, 'resident_id') : null,
    entry_date: text(formData, 'entry_date') ?? undefined,
    entry_time: text(formData, 'entry_time'),
    data,
    amount,
    share_with_family: type.scope === 'resident' && formData.get('share_with_family') === 'on',
    created_by: user.id,
  });
  if (error) throw new Error('Could not save: ' + error.message);
  const path = text(formData, 'path');
  if (path?.startsWith('/')) revalidatePath(path.split('?')[0]);
}

export async function deleteEntry(formData) {
  const { supabase } = await requireUser(['admin']);
  const { error } = await supabase.from('entries').delete().eq('id', text(formData, 'id'));
  if (error) throw new Error('Could not remove: ' + error.message);
  const path = text(formData, 'path');
  if (path?.startsWith('/')) revalidatePath(path.split('?')[0]);
}
