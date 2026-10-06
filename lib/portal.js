// Who can see / add / edit in the portal.
// A division opens for a person when their staff level reaches the division's level
// (set by the admin on the Admin page), or when the admin adds them on that
// division's "Who has access". The database enforces the same rule (has_division).
import { DIVISIONS } from '@/lib/divisions';
import { levelOf, groupOf, GROUPS, DEFAULT_DIVISION_LEVELS } from '@/lib/levels';

export async function getDivisionLevels(supabase) {
  const { data, error } = await supabase.from('division_levels').select('division, view_level, edit_level');
  if (error || !data) return { ...DEFAULT_DIVISION_LEVELS };
  return { ...DEFAULT_DIVISION_LEVELS, ...Object.fromEntries(data.map((d) => [d.division, d])) };
}

// grants[division] = { can_edit, byLevel?, view_level, edit_level }
export async function getGrants(supabase, profile) {
  if (profile.role === 'admin') return {};
  const [{ data }, levels] = await Promise.all([
    supabase.from('portal_access').select('division, can_edit').eq('profile_id', profile.id),
    getDivisionLevels(supabase),
  ]);
  const lvl = levelOf(profile);
  const out = {};
  const group = GROUPS.find((g) => g.key === groupOf(profile));
  if (group) {
    // HR opens the HR division, Payroll opens Finance; nothing else by level.
    out[group.division] = { division: group.division, can_edit: true, byLevel: true };
  } else for (const d of DIVISIONS) {
    const dl = levels[d.key] ?? { view_level: 8, edit_level: 8 };
    if (lvl > 0 && lvl >= dl.view_level) out[d.key] = { division: d.key, can_edit: lvl >= dl.edit_level, byLevel: true };
  }
  for (const g of data ?? []) {
    const cur = out[g.division];
    out[g.division] = { division: g.division, can_edit: !!(g.can_edit || cur?.can_edit), byLevel: !!cur?.byLevel, granted: true };
  }
  return out;
}

export function isBoss(profile) { return ['admin', 'manager'].includes(profile.role); }
export function isAdmin(profile) { return profile.role === 'admin'; }

export function canSee(profile, grants, div) {
  return isAdmin(profile) || !!grants[div.key];
}

export function canEditRecord(profile, grants, record, userId) {
  if (isAdmin(profile)) return true;
  const g = grants[record.division];
  return !!g && (g.can_edit || record.created_by === userId);
}

export function visibleDivisions(profile, grants) {
  return DIVISIONS.filter((d) => canSee(profile, grants, d));
}
