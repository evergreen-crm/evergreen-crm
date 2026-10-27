'use server';
// 🔒 Security settings — administrator only (checked here and by the database).
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { LEVEL_ORDER } from '@/lib/sections';

const NOT_ON = 'Security settings aren’t switched on yet (setup file: section-access.sql).';
const clean = (e) => (/does not exist|Could not find the function/i.test(e?.message ?? '') ? NOT_ON : e?.message ?? 'Something went wrong.');

export async function setLevel({ section, role, level }) {
  const { supabase, profile } = await requireUser(['admin']);
  if (profile.role !== 'admin') return { error: 'Only the administrator can change security settings.' };
  if (!LEVEL_ORDER.includes(level)) return { error: 'Unknown setting.' };
  const { error } = await supabase.rpc('set_section_access', { p_section: section, p_role: role, p_level: level });
  if (error) return { error: clean(error) };
  revalidatePath('/', 'layout');
  return { ok: true, level };
}

export async function resetAll() {
  const { supabase } = await requireUser(['admin']);
  const { data, error } = await supabase.rpc('reset_section_access');
  if (error) return { error: clean(error) };
  revalidatePath('/', 'layout');
  return { ok: true, changed: data ?? 0 };
}
