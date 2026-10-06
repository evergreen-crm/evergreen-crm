// Staff access levels 1-8. Each person has one level = their security level.
// The database keeps `role` in step with the level (see supabase/access-levels.sql):
//   1-2 -> staff (their home), 3-7 -> manager (all homes), 8 -> admin.

export const LEVELS = [
  { level: 1, key: 'frontline', name: 'Frontline', hint: 'Shift notes, MAR, incidents, own schedule and timesheet — their home' },
  { level: 2, key: 'pc', name: 'Program Coordinator', hint: 'Reviews notes and incidents, schedules, care plans — their home' },
  { level: 3, key: 'pm', name: 'Program Manager', hint: 'All homes: approvals, timesheets, clearance decisions' },
  { level: 4, key: 'doo', name: 'Director of Operations', hint: 'Admissions, organization-wide reports, licensing' },
  { level: 5, key: 'ed', name: 'Executive Director', hint: 'Payroll, billing, finance and governance' },
  { level: 6, key: 'cso', name: 'CSO', hint: 'Approves contracts and budgets' },
  { level: 7, key: 'ceo', name: 'CEO', hint: 'Security audit log, full leadership access' },
  { level: 8, key: 'admin', name: 'Administrator', hint: 'Everything, including giving people access' },
];

export function roleForLevel(level) {
  const n = Number(level);
  if (n >= 8) return 'admin';
  if (n >= 3) return 'manager';
  return 'staff';
}

// The person's level; admins are always 8, families have none.
export function levelOf(profile) {
  if (!profile || profile.role === 'family') return 0;
  if (profile.role === 'admin') return 8;
  if (profile.level) return Number(profile.level);
  return profile.role === 'manager' ? 3 : profile.role === 'staff' ? 1 : 0;
}

export function levelName(level) {
  return LEVELS.find((l) => l.level === Number(level))?.name ?? '—';
}

// HR and Payroll: chosen in the same "Access level" list, stored as level 2 + profiles.staff_group.
// They work across all homes but don't see residents or care records (supabase/staff-groups.sql).
export const GROUPS = [
  { key: 'hr', name: 'HR', level: 2, division: 'hr', areas: ['hr', 'training', 'staffing', 'compliance'],
    hint: 'All staff files: certificates, training, onboarding, ID cards, policy sign-offs, prescreening — no resident records' },
  { key: 'payroll', name: 'Payroll', level: 2, division: 'finance', areas: ['finance', 'staffing'],
    hint: 'Timesheets (fix and approve), schedules, employment details, Finance division — no resident records' },
];
export function groupOf(profile) {
  return profile?.role === 'staff' && GROUPS.some((g) => g.key === profile?.staff_group) ? profile.staff_group : null;
}
export const groupName = (key) => GROUPS.find((g) => g.key === key)?.name ?? null;
const isBoss = (p) => ['admin', 'manager'].includes(p?.role);
export const canHR = (p) => isBoss(p) || groupOf(p) === 'hr';
export const canPayroll = (p) => isBoss(p) || groupOf(p) === 'payroll';

// The value used in the Access level drop-downs: 1-8, 'hr' or 'payroll'.
export const accessValue = (p) => groupOf(p) ?? levelOf(p);
// Read a drop-down value back: { level, group } or null if it isn't valid.
export function parseAccess(v) {
  const g = GROUPS.find((x) => x.key === v);
  if (g) return { level: g.level, group: g.key };
  const n = Number(v);
  return n >= 1 && n <= 8 ? { level: n, group: null } : null;
}

export function personLabel(profile) {
  if (profile?.role === 'family') return 'Family';
  const g = groupOf(profile);
  if (g) return groupName(g);
  return `${levelOf(profile)} · ${levelName(levelOf(profile))}`;
}

export function needsHome(level, group) {
  return !group && Number(level) <= 2;
}

// Used only if the division_levels table hasn't been created yet.
export const DEFAULT_DIVISION_LEVELS = {
  governance: { view_level: 5, edit_level: 5 },
  program: { view_level: 1, edit_level: 3 },
  hr: { view_level: 2, edit_level: 3 },
  finance: { view_level: 3, edit_level: 5 },
  qa: { view_level: 2, edit_level: 3 },
  ohs: { view_level: 3, edit_level: 4 },
  external: { view_level: 3, edit_level: 4 },
};
