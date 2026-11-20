'use server';
// Opening-day readiness (plan E2): tick list and the "switch off test accounts" button.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { GOLIVE_KEYS } from './items';

export async function saveItem(fd) {
  const { supabase, user } = await requireUser(['admin']);
  const key = String(fd.get('key') ?? '');
  if (!GOLIVE_KEYS.includes(key)) redirect('/admin/go-live');
  const done = fd.get('done') === 'yes';
  const note = String(fd.get('note') ?? '').trim().slice(0, 1000) || null;
  const { error } = await supabase.from('golive_items').upsert({ key, done, note, done_by: done ? user.id : null, done_at: done ? new Date().toISOString() : null });
  if (error) redirect('/admin/go-live?error=' + encodeURIComponent(error.message));
  revalidatePath('/admin/go-live');
  redirect(`/admin/go-live?ok=${encodeURIComponent(done ? 'Ticked.' : 'Saved.')}#${key}`);
}

export async function switchOffTests(fd) {
  const { supabase } = await requireUser(['admin']);
  if (fd.get('confirm') !== 'SWITCH OFF') redirect('/admin/go-live?error=' + encodeURIComponent('Type SWITCH OFF to confirm.') + '#tests');
  const { data: ids, error } = await supabase.rpc('golive_switch_off_tests');
  if (error) redirect('/admin/go-live?error=' + encodeURIComponent(error.message) + '#tests');
  let blocked = 0;
  if ((ids ?? []).length && adminKey()) {
    const admin = createAdminClient();
    for (const id of ids) {
      const { error: e } = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' });
      if (!e) blocked++;
    }
  }
  revalidatePath('/admin/go-live'); revalidatePath('/admin');
  redirect('/admin/go-live?ok=' + encodeURIComponent(`${ids?.length ?? 0} test account${ids?.length === 1 ? '' : 's'} switched off${blocked ? `, sign-in blocked for ${blocked}` : ''}. Turn one back on from Admin if you ever need it.`) + '#tests');
}
