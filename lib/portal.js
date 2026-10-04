// Who can see / add / edit in the portal.
// Only the admin sees every division. Everyone else (managers included) sees a
// division only after the admin gives them access on that division's page.
import { DIVISIONS } from '@/lib/divisions';

export async function getGrants(supabase, profile) {
  if (profile.role === 'admin') return {};
  const { data } = await supabase.from('portal_access').select('division, can_edit').eq('profile_id', profile.id);
  return Object.fromEntries((data ?? []).map((g) => [g.division, g]));
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
