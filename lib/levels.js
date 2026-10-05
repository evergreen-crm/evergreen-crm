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

export function personLabel(profile) {
  if (profile?.role === 'family') return 'Family';
  return `${levelOf(profile)} · ${levelName(levelOf(profile))}`;
}

export function needsHome(level) {
  return Number(level) <= 2;
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
