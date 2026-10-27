// Server helper: my sections, using the live Security settings (my_sections()) — falls back to the recommended ones.
import 'server-only';
import { mySections } from '@/lib/sections';

export async function loadMySections(supabase, profile, ctx = {}) {
  let levels = null;
  try {
    const { data, error } = await supabase.rpc('my_sections');
    if (!error) levels = Object.fromEntries((data ?? []).map((r) => [r.section, r.level]));
  } catch {}
  return mySections(profile, levels, ctx);
}
// Everything I can open, for 🔍 Find.
export function sectionFindItems(sections) {
  return sections.flatMap((s) => [{ label: s.label, href: `/s/${s.key}`, icon: s.icon, where: 'Sections' }, ...s.tiles.map((t) => ({ ...t, where: s.label }))]);
}
