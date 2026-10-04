'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

export async function markAllRead() {
  const { supabase, user } = await requireUser();
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('profile_id', user.id).is('read_at', null);
  revalidatePath('/', 'layout');
}

export async function openNotification(formData) {
  const { supabase, user } = await requireUser();
  const id = formData.get('id');
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('profile_id', user.id);
  const link = formData.get('link');
  redirect(typeof link === 'string' && link.startsWith('/') ? link : '/notifications');
}
