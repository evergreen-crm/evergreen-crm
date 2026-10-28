'use server';
// House contacts (supabase/house-contacts.sql).
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null; };

export async function saveHouseContact(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const home = text(fd, 'home_id');
  const row = {
    home_id: home,
    kind: text(fd, 'kind'),
    name: text(fd, 'name'),
    organisation: text(fd, 'organisation'),
    phone: text(fd, 'phone'),
    email: text(fd, 'email'),
    address: text(fd, 'address'),
    notes: text(fd, 'notes'),
    updated_at: new Date().toISOString(),
  };
  if (!row.name || !row.kind) throw new Error('Choose the kind of contact and write their name.');
  const id = text(fd, 'id');
  const { error } = id
    ? await supabase.from('house_contacts').update(row).eq('id', id)
    : await supabase.from('house_contacts').insert(row);
  if (error) throw new Error('Could not save the contact: ' + error.message);
  revalidatePath(`/homes/${home}`);
}

export async function setHouseContactActive(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const home = text(fd, 'home_id');
  const { error } = await supabase.from('house_contacts').update({ active: fd.get('active') === '1' }).eq('id', text(fd, 'id'));
  if (error) throw new Error('Could not change the contact: ' + error.message);
  revalidatePath(`/homes/${home}`);
}
