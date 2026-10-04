// Who can see / add / edit in the portal.
import { DIVISIONS } from '@/lib/divisions';

export async function getGrants(supabase, profile) {
  if (['admin', 'manager'].includes(profile.role)) return {};
  const { data } = await supabase.from('portal_access').select('division, can_edit').eq('profile_id', profile.id);
  return Object.fromEntries((data ?? []).map((g) => [g.division, g]));
}

export function isBoss(profile) { return ['admin', 'manager'].includes(profile.role); }

export function canSee(profile, grants, div, area) {
  if (isBoss(profile) || grants[div.key]) return true;
  return profile.role === 'staff' && (area ? !!area.staff : div.areas.some((a) => a.staff));
}

export function canEditRecord(profile, grants, record, userId) {
  return isBoss(profile) || !!grants[record.division]?.can_edit || record.created_by === userId;
}

export function visibleDivisions(profile, grants) {
  return DIVISIONS
    .map((d) => ({ ...d, areas: d.areas.filter((a) => canSee(profile, grants, d, a)) }))
    .filter((d) => d.areas.length > 0);
}
