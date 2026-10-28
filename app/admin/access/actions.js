'use server';
// 👤 Access & departments: admin and CEO only (checked here; the database keeps the same profile fields).
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { levelOf, GROUPS } from '@/lib/levels';
import { DEPARTMENTS, SECTIONS, LEVEL_ORDER } from '@/lib/sections';

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

// Per-person section levels: { section: level }. A level of 'default' removes the person's own setting.
export async function savePersonSections({ id, levels }) {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!canManage(profile)) return { error: 'Only the administrator and the CEO can give access.' };
  const known = new Set(SECTIONS.map((x) => x.key));
  const rows = [];
  const drops = [];
  for (const [section, level] of Object.entries(levels ?? {})) {
    if (!known.has(section)) continue;
    if (level === 'default') { drops.push(section); continue; }
    if (!LEVEL_ORDER.includes(level)) return { error: 'Unknown level.' };
    rows.push({ profile_id: id, section, level, set_by: profile.id, set_at: new Date().toISOString() });
  }
  if (rows.length) {
    const { error } = await supabase.from('person_section_access').upsert(rows, { onConflict: 'profile_id,section' });
    if (error) return { error: error.message };
  }
  if (drops.length) {
    const { error } = await supabase.from('person_section_access').delete().eq('profile_id', id).in('section', drops);
    if (error) return { error: error.message };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
