'use server';
// House activity plan: saving activities (supabase/activity-plans.sql).
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null; };

export async function saveActivity(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const home = text(fd, 'home_id');
  const row = {
    home_id: home,
    weekday: fd.get('weekday') === '' || fd.get('weekday') == null ? null : Number(fd.get('weekday')),
    time_from: text(fd, 'time_from'),
    time_to: text(fd, 'time_to'),
    shift: text(fd, 'shift'),
    activity: text(fd, 'activity'),
    resident_ids: fd.getAll('resident_ids').filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)),
    notes: text(fd, 'notes'),
  };
  if (!row.activity) throw new Error('Write what the activity is.');
  const id = text(fd, 'id');
  const q = id ? supabase.from('activity_plans').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id)
    : supabase.from('activity_plans').insert(row);
  const { error } = await q;
  if (error) throw new Error('Could not save the activity: ' + error.message);
  revalidatePath(`/homes/${home}/activities`);
}

export async function setActivityActive(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const home = text(fd, 'home_id');
  const { error } = await supabase.from('activity_plans').update({ active: fd.get('active') === '1' }).eq('id', text(fd, 'id'));
  if (error) throw new Error('Could not change the activity: ' + error.message);
  revalidatePath(`/homes/${home}/activities`);
}
