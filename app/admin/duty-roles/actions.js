'use server';
// Who holds an agency-wide duty role (for example the clinical lead). Administrator only; the database checks too.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const ROLES = ['clinical_lead', 'executive_director'];

export async function setDutyRole(fd) {
  const { supabase } = await requireUser(['admin']);
  const role = fd.get('owner_role');
  const person = fd.get('profile_id') || null;
  if (!ROLES.includes(role)) redirect('/admin/duty-roles?error=' + encodeURIComponent('Unknown role.'));
  const { error: e1 } = await supabase.from('duty_role_holders').delete().eq('owner_role', role).is('home_id', null);
  if (e1) redirect('/admin/duty-roles?error=' + encodeURIComponent(e1.message));
  if (person) {
    const { error } = await supabase.from('duty_role_holders').insert({ owner_role: role, home_id: null, profile_id: person });
    if (error) redirect('/admin/duty-roles?error=' + encodeURIComponent(error.message));
  }
  revalidatePath('/admin/duty-roles');
  redirect('/admin/duty-roles?ok=' + encodeURIComponent('Saved. New tasks for this role go to the person you chose.'));
}
