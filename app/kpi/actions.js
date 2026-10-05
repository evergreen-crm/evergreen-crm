'use server';
// KPI owners: level 4+ (Director of Operations, Executive Director, CSO, CEO, Administrator)
// assigns one person to each KPI. Open automatic action items for that KPI move to the new owner.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { kpiKeyFor } from '@/lib/kpis';

const back = (msg, bad) => redirect(`/kpi/owners?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);

export async function saveKpiOwners(formData) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager']);
  if (levelOf(profile) < 4) back('Only the Director of Operations, Executive Director, CSO, CEO or an Administrator can assign KPI owners.', true);

  const { data: current, error } = await supabase.from('kpi_owners').select('kpi_key, owner_id');
  if (error) back('Run supabase/kpi-phase2.sql in Supabase first. (' + error.message + ')', true);
  const was = Object.fromEntries((current ?? []).map((r) => [r.kpi_key, r.owner_id]));

  const changes = [];
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith('owner_')) continue;
    const key = name.slice(6);
    const owner = typeof value === 'string' && value ? value : null;
    if ((was[key] ?? null) !== owner) changes.push({ key, owner });
  }
  if (!changes.length) back('No changes.');

  const now = new Date().toISOString();
  for (const c of changes) {
    const { error: e } = c.owner
      ? await supabase.from('kpi_owners').upsert({ kpi_key: c.key, owner_id: c.owner, assigned_by: user.id, assigned_at: now }, { onConflict: 'kpi_key' })
      : await supabase.from('kpi_owners').delete().eq('kpi_key', c.key);
    if (e) back('Could not save: ' + e.message, true);
  }

  // Move open automatic action items for those KPIs to the new owner (not ones already waiting for approval).
  let moved = 0;
  const assignedNow = Object.fromEntries(changes.filter((c) => c.owner).map((c) => [c.key, c.owner]));
  if (Object.keys(assignedNow).length) {
    const { data: items } = await supabase.from('action_items').select('id, source_key, category, owner_id, status').eq('auto', true).in('status', ['Open', 'In progress']);
    for (const i of items ?? []) {
      const to = assignedNow[kpiKeyFor(i)];
      if (!to || i.owner_id === to) continue;
      const { error: e } = await supabase.from('action_items').update({ owner_id: to }).eq('id', i.id);
      if (!e) {
        moved++;
        await supabase.from('action_item_events').insert({ item_id: i.id, actor_id: user.id, action: 'Assigned', note: 'New KPI owner assigned' });
      }
    }
  }
  revalidatePath('/kpi'); revalidatePath('/kpi/owners'); revalidatePath('/action-items'); revalidatePath('/portal');
  back(`Saved ${changes.length} KPI owner change${changes.length === 1 ? '' : 's'}${moved ? ` · ${moved} open action item${moved === 1 ? '' : 's'} moved to the new owner` : ''}.`);
}
