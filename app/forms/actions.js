'use server';
// Save a policy form (Forms Batch 1+). Same storage as every record (entries); when it was opened from a
// reminder task, the task is marked "Evidence submitted" with a link to the saved form.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ENTRY_TYPES } from '@/lib/entries';
import { todayISO, nowTime } from '@/lib/options';

const val = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };

export async function saveFormEntry(fd) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const kind = val(fd, 'kind');
  const type = ENTRY_TYPES[kind];
  const residentId = val(fd, 'resident_id');
  const homeId = val(fd, 'home_id');
  const task = val(fd, 'task');
  const q = new URLSearchParams({ ...(residentId ? { resident: residentId } : {}), ...(homeId && !residentId ? { home: homeId } : {}), ...(task ? { task } : {}) });
  const back = (k, msg) => redirect(`/forms/${kind}?${q}&${k}=${encodeURIComponent(msg)}`);
  if (!type) redirect('/forms?error=' + encodeURIComponent('Unknown form.'));

  const data = {};
  for (const f of type.fields) {
    const v = val(fd, f.name);
    if (f.required && v === null) back('error', `Please answer “${f.label}”.`);
    if (v !== null) data[f.name] = f.type === 'number' ? Number(v) : v;
  }
  const { data: row, error } = await supabase.from('entries').insert({
    kind, home_id: homeId, resident_id: type.scope === 'resident' ? residentId : null,
    entry_date: val(fd, 'entry_date') ?? todayISO(), entry_time: val(fd, 'entry_time') ?? nowTime(),
    data, share_with_family: false, created_by: user.id,
  }).select('id').single();
  if (error) back('error', 'Could not save: ' + error.message);

  let taskNote = '';
  if (task && /^[0-9a-f-]{36}$/i.test(task)) {
    const { data: done } = await supabase.from('action_items').update({
      status: 'Evidence submitted', evidence_note: `Form completed: ${type.label}`,
      evidence_link: `/forms/${kind}?${q}#e-${row.id}`, evidence_by: user.id, evidence_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', task).in('status', ['Open', 'In progress']).select('id');
    taskNote = done?.length ? ' The reminder task is marked done and sent for approval.' : '';
  }
  revalidatePath(`/forms/${kind}`);
  q.delete('task');
  redirect(`/forms/${kind}?${q}&ok=${encodeURIComponent(`Saved.${taskNote}`)}#e-${row.id}`);
}
