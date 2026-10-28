'use server';
// 👤 Access & departments: admin and CEO only (checked here; the database keeps the same profile fields).
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { levelOf, GROUPS } from '@/lib/levels';
import { DEPARTMENTS } from '@/lib/sections';

const canManage = (p) => p?.role === 'admin' || levelOf(p) >= 7;

export async function savePersonAccess({ id, department, extra }) {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!canManage(profile)) return { error: 'Only the administrator and the CEO can give access.' };
  if (!DEPARTMENTS.includes(department)) return { error: 'Pick a department from the list.' };
  const extraClean = (extra ?? []).filter((d) => DEPARTMENTS.includes(d) && d !== department);
  const { data: target, error: readErr } = await supabase.from('profiles').select('id, role, level').eq('id', id).maybeSingle();
  if (readErr || !target) return { error: 'Person not found.' };
  // Nobody can lower the administrator or CEO; they always see everything.
  if (target.role === 'admin' || levelOf(target) >= 7) return { error: 'The administrator and CEO always see every department.' };
  const { error } = await supabase.from('profiles').update({ department, extra_departments: extraClean }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}

export const GROUP_NAMES = Object.fromEntries(GROUPS.map((g) => [g.key, g.name]));
