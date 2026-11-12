'use server';
// Switch a duty on or off (admins only; the database also enforces this).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

export async function toggleDuty(formData) {
  const { supabase } = await requireUser(['admin']);
  const id = formData.get('id');
  const active = formData.get('active') === 'true';
  const { error } = await supabase.from('duties').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/admin/duties');
  if (error) redirect('/admin/duties?error=' + encodeURIComponent(error.message));
  redirect('/admin/duties?show=all&ok=' + encodeURIComponent(active ? 'Duty switched on.' : 'Duty switched off.'));
}
