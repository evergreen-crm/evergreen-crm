// 🔒 The 10 menu sections and their Security settings (supabase/section-access.sql), defined once.
// Melvin, Oct 26 2026: sections for HR, quality, health and safety, programs, individuals, houses…, easy to use,
// with the security setting for who can access each one.
//  · The administrator sets, for each section and role, one of the LEVELS (Admin → 🔒 Security settings).
//  · A section shows in the menu when its setting isn't "No access" and at least one of its tiles opens for that
//    person (some pages also keep a fixed limit, e.g. the COA portal is directors only).
//  · For Individuals, Houses and Schedule the setting is also the database rule (which houses' records).
import { levelOf, groupOf, canHR, canPayroll } from '@/lib/levels';

export const ROLES = [
  ['fr', 'Frontline'], ['pc', 'Program Coordinator'], ['pm', 'Program Manager'], ['dir', 'Directors'],
  ['hr', 'HR'], ['pay', 'Payroll'], ['adm', 'Administrator'],
];
export const LEVELS = {
  none: { icon: '—', name: 'No access', you: 'No access.' },
  read: { icon: '👁', name: 'Read only', you: 'Read only.' },
  own: { icon: '👤', name: 'Only their own', you: 'Only your own.' },
  house: { icon: '🏡', name: 'Their house', you: 'Your own house.' },
  assigned: { icon: '🏘', name: 'Assigned houses', you: 'The houses you’re assigned to.' },
  all: { icon: '🌐', name: 'Every house', you: 'Every house.' },
};
export const LEVEL_ORDER = ['none', 'read', 'own', 'house', 'assigned', 'all'];
export const LOCKED = { adm: 'Admin is always administrator-only.', day: null };
export const SCOPED = ['ind', 'houses', 'sched']; // the setting is also the database rule for these

// Recommended settings (same as section_defaults() in supabase/section-access.sql).
export const DEFAULTS = {
  day: { fr: 'all', pc: 'all', pm: 'all', dir: 'all', hr: 'all', pay: 'all', adm: 'all' },
  ind: { fr: 'house', pc: 'house', pm: 'assigned', dir: 'all', hr: 'none', pay: 'none', adm: 'all' },
  houses: { fr: 'house', pc: 'house', pm: 'assigned', dir: 'all', hr: 'none', pay: 'none', adm: 'all' },
  sched: { fr: 'house', pc: 'house', pm: 'assigned', dir: 'all', hr: 'own', pay: 'own', adm: 'all' },
  prog: { fr: 'none', pc: 'read', pm: 'assigned', dir: 'all', hr: 'none', pay: 'none', adm: 'all' },
  hr: { fr: 'own', pc: 'house', pm: 'assigned', dir: 'all', hr: 'all', pay: 'none', adm: 'all' },
  pay: { fr: 'own', pc: 'house', pm: 'assigned', dir: 'all', hr: 'none', pay: 'all', adm: 'all' },
  hs: { fr: 'read', pc: 'house', pm: 'assigned', dir: 'all', hr: 'read', pay: 'read', adm: 'all' },
  qa: { fr: 'none', pc: 'house', pm: 'assigned', dir: 'all', hr: 'none', pay: 'none', adm: 'all' },
  adm: { fr: 'none', pc: 'none', pm: 'none', dir: 'none', hr: 'none', pay: 'none', adm: 'all' },
};

export function roleKeyOf(profile) {
  if (!profile) return null;
  if (profile.role === 'admin') return 'adm';
  if (profile.role === 'family') return 'family';
  const g = groupOf(profile);
  if (g === 'hr') return 'hr';
  if (g === 'payroll') return 'pay';
  const l = levelOf(profile);
  return l >= 4 ? 'dir' : l === 3 ? 'pm' : l === 2 ? 'pc' : 'fr';
}

// Tiles: [icon, label, sub, href, can(ctx)?]
const T = (icon, label, sub, href, can) => ({ icon, label, sub, href, can });
const lead = (c) => c.lvl >= 2 && !c.grp;
const mgr = (c) => c.isAdmin || c.role === 'manager';
const director = (c) => c.isAdmin || (c.lvl >= 4 && !c.grp);

export const SECTIONS = [
  { key: 'day', dept: 'Everyone', icon: '🏠', label: 'My Day', blurb: 'Clock in, today’s shift, sick calls, my to-do.', who: 'Everyone, for their own day.', tiles: (c) => [
    T('⏰', 'Clock In – Clock Out', 'At the house', '/id#checkin'),
    T('📋', 'My shift checklist', 'Tick and sign', '/checklist', (x) => !!x.home && !x.grp),
    T('📝', 'Daily notes', 'Everyone, one screen', '/notes', (x) => !!x.home && !x.grp),
    T('✅', 'My to-do', 'What’s due', '/todo'),
    T('🔔', 'Alerts', 'Inbox', '/notifications'),
    T('🤒', 'Sick / can’t make my shift', 'Tell your leaders', '/absence'),
    T('🪪', 'My ID card', 'Show at the house', '/id'),
    T('✍️', 'Documents to sign', 'Waiting for me', '/sign'),
    T('💡', 'My suggestions', 'Ideas and answers', '/suggest'),
    T('🎓', 'Evergreen Academy', 'My courses', '/academy'),
    T('🤖', 'Ask Evergreen', 'Policy questions', '/ask'),
  ] },
  { key: 'ind', dept: 'Houses & Care', icon: '👤', label: 'Individuals', blurb: 'Youth (MCFD) and adults (CLBC): each person’s file.', who: 'Staff and the PC of their house, PMs for their assigned houses, directors.', tiles: (c) => [
    T('👥', 'Residents', 'Profiles, alerts, files', c.houseHref('residents')),
    T('💊', 'Medication (MAR)', 'Open the person', c.houseHref('residents')),
    T('⚠️', 'Report an incident', 'Open the person', c.houseHref('residents')),
    T('📝', 'Daily notes', 'Everyone, one screen', '/notes', (x) => !!x.home && !x.grp),
    T('🔎', 'Missing youth', 'Start the protocol', '/missing'),
    T('📅', 'Appointments', 'House calendar', '/calendar'),
    T('➕', 'Add a resident', 'New placement', '/residents/new', mgr),
  ] },
  { key: 'houses', dept: 'Houses & Care', icon: '🏡', label: 'Houses', blurb: 'Each house’s dashboard and daily running.', who: 'Staff and the PC of the house, its assigned PMs, directors.', tiles: (c) => [
    T('🏡', c.home ? 'My house' : 'My houses', 'Dashboard', c.home ? c.houseHref('dashboard') : '/homes'),
    T('🏘', 'All my houses', 'Every house I can see', '/homes', (x) => x.lvl >= 3 || x.isAdmin),
    T('📒', 'Shift log & comm book', 'Handover', c.houseHref('commbook'), (x) => !!x.home),
    T('📅', 'Calendar', 'Appointments', '/calendar'),
    T('🔥', 'Fire drill & safety check', 'This month', c.houseHref('safety')),
    T('⚠️', 'Problems to fix', 'Open items', '/action-items'),
    T('🧩', 'Missing details', 'Gaps in records', '/records', (x) => x.lvl >= 2 || x.hr),
    T('✅', 'Approvals & 🆘', 'Waiting for me', '/approvals', lead),
    T('📍', 'Staff on shift now', 'Who’s clocked in', '/checkins', mgr),
  ] },
  { key: 'sched', dept: 'Operations', icon: '🗓', label: 'Schedule & Time', blurb: '30-day calendar, shifts, time off, hours.', who: 'Own shifts for everyone; the house schedule for its staff, PC and assigned PMs; directors all.', tiles: () => [
    T('🗓', '30-day calendar', 'Opens every time', '/schedule'),
    T('📆', 'My 6 months', '+ phone calendar', '/schedule?tab=mine'),
    T('🙋', 'Open shifts & swaps', 'Pick up', '/schedule?tab=open'),
    T('🌴', 'Time off', 'Ask early', '/schedule?tab=timeoff'),
    T('📞', 'Can’t make my shift', 'Sick or running late', '/absence'),
    T('👥', 'Staffing & lines', '1 or 2 staff', '/schedule?tab=teams', lead),
    T('⏰', 'Attendance today', 'Who’s in', '/attendance', (x) => lead(x) || x.pay || mgr(x)),
    T('⏱', 'Timesheets', 'Hours', '/timesheet'),
  ] },
  { key: 'prog', dept: 'Operations', icon: '📋', label: 'Programs', blurb: 'MCFD youth and CLBC adult programs: intake, new houses, reports.', who: 'PMs for assigned houses and directors; PCs can read their house’s reports.', tiles: () => [
    T('📨', 'Referrals & intake', 'New placements', '/intake', mgr),
    T('🚀', 'Opening a new house', 'Launch plan', '/launch', mgr),
    T('📈', 'Program KPIs', 'How we’re doing', '/kpi', lead),
    T('🖨', 'Print documentation', 'For funders', '/reports/daily', lead),
  ] },
  { key: 'hr', dept: 'HR & Orientation', icon: '👥', label: 'HR & People', blurb: 'Hiring, onboarding, reviews, training.', who: 'HR: everything. PCs / PMs: reviews and badges for their houses. Staff: their own file and training.', tiles: (c) => [
    T('👥', 'Staff files', 'HR', '/hr', (x) => x.hr || mgr(x)),
    T('📁', 'My HR file', 'Documents and certificates', `/hr/${c.me}`, (x) => !x.hr && !mgr(x)),
    T('🧾', 'Job applicants', 'Prescreen + references', '/hr/prescreen', (x) => !!x.psRole),
    T('✅', 'My onboarding', 'Checklist', '/onboarding', (x) => !!x.onboarding),
    T('📝', 'First-90-days reviews', '30 / 60 / 90', '/probation'),
    T('🏅', 'Badges', 'Monthly', '/badges'),
    T('🎓', 'Evergreen Academy', 'Courses', '/academy'),
    T('📅', 'My 90-day plan', 'Training', '/academy/plan'),
    T('🎬', 'Course videos', 'Upload', '/academy/videos', (x) => x.lvl >= 6 || x.isAdmin),
    T('📘', 'Policies', 'Read and sign', '/policies'),
    T('🌱', 'Career & perks', 'Promotions', '/careers'),
    T('🧩', 'Missing details', 'Staff records', '/records', (x) => x.hr),
  ] },
  { key: 'pay', dept: 'Finance & Payroll', icon: '💵', label: 'Payroll', blurb: 'Hours, sick days and time off for pay.', who: 'Payroll and directors. Staff see their own hours; PCs / PMs approve their houses.', tiles: () => [
    T('⏱', 'Timesheets', 'Hours to approve', '/timesheet'),
    T('🤒', 'Sick days & attendance', 'BC rules', '/attendance', (x) => x.pay || director(x)),
    T('📞', 'My call-ins this year', 'Late arrivals, no-shows', '/absence#year', (x) => !x.pay),
  ] },
  { key: 'hs', dept: 'Health & Safety', icon: '🦺', label: 'Health & Safety', blurb: 'Emergency plans, drills, OHS.', who: 'Everyone reads the plans; PCs record drills for their house; PMs for assigned houses; directors all.', tiles: (c) => [
    T('🔎', 'Missing youth', 'Start the protocol', '/missing', (x) => !x.grp),
    T('🔥', 'Fire drill & safety check', 'Record it', c.houseHref('safety'), (x) => !x.grp && (!!x.home || x.lvl >= 3)),
    T('📘', 'Emergency & OHS policies', 'Read', '/policies'),
    T('🦺', 'Safety across houses', 'Drills and checks', '/qa/safety', director),
    T('⚠️', 'Problems to fix', 'Hazards', '/action-items', (x) => !x.grp),
    T('❓', 'Rules and laws we follow', 'Plain words', '/help'),
  ] },
  { key: 'qa', dept: 'Quality', icon: '📈', label: 'Quality', blurb: 'KPIs, COA accreditation, surveys, audits.', who: 'PCs: their house’s monthly review. PMs: assigned houses. Directors: full COA portal.', tiles: () => [
    T('📈', 'KPIs', 'How we’re doing', '/kpi', lead),
    T('🗓', 'Monthly QA review', 'Due the 10th', '/review', (x) => lead(x) && x.lvl <= 7 && !x.isAdmin),
    T('🏅', 'COA portal', 'Standards and evidence', '/qa', director),
    T('📋', 'Surveys', 'Feedback', '/qa/surveys', director),
    T('💡', 'Staff suggestions', 'Answer them', '/qa/suggestions', director),
    T('🔍', 'File audits', 'Resident files', '/qa/audits', director),
    T('🖨', 'Print documentation', 'Reports', '/reports/daily', lead),
  ] },
  { key: 'adm', dept: 'Admin', icon: '⚙️', label: 'Admin', blurb: 'Users, access levels and security settings.', who: 'The administrator only.', tiles: () => [
    T('🔒', 'Security settings', 'Who can see each section', '/admin/security'),
    T('⚙️', 'Admin', 'Users and settings', '/admin'),
    T('📚', 'Import policies', 'Policy library', '/admin/import-policies'),
  ] },
];
// Step 1 of the department menu: each section belongs to one department. Admin and CEO see every department.
export const DEPARTMENTS = ['Everyone', 'Houses & Care', 'Operations', 'HR & Orientation', 'Finance & Payroll', 'Health & Safety', 'Quality', 'Admin'];
export const sectionByKey = (k) => SECTIONS.find((s) => s.key === k);

// My sections: levels = { day: 'all', ind: 'house', … } from my_sections() (falls back to the recommended settings).
export function mySections(profile, levels, ctx = {}) {
  const rk = roleKeyOf(profile);
  if (!rk || rk === 'family') return [];
  const home = ctx.homeId ?? profile.home_id ?? null;
  const c = {
    me: profile.id, lvl: levelOf(profile), grp: groupOf(profile), role: profile.role, isAdmin: profile.role === 'admin',
    hr: canHR(profile), pay: canPayroll(profile), home, psRole: ctx.psRole ?? null, onboarding: !!ctx.onboarding,
    houseHref: (tab) => (home ? `/homes/${home}${tab ? `?tab=${tab}` : ''}` : '/homes'),
  };
  // Step 2: a section shows only for the person's department (profiles.department, plus any extra_departments).
  // Admin and CEO (level 7 and up) see every department.
  const fullAccess = rk === 'adm' || levelOf(profile) >= 7;
  const extra = Array.isArray(profile.extra_departments) ? profile.extra_departments : [];
  const deptOk = (s) => fullAccess || s.dept === 'Everyone' || s.dept === profile.department || extra.includes(s.dept);
  return SECTIONS.map((s) => {
    if (!deptOk(s)) return null;
    const level = rk === 'adm' ? 'all' : (levels?.[s.key] ?? DEFAULTS[s.key]?.[rk] ?? 'none');
    if (level === 'none') return null;
    const tiles = s.tiles(c).filter((t) => !t.can || t.can(c)).map(({ can, ...t }) => t);
    if (!tiles.length) return null;
    return { key: s.key, icon: s.icon, label: s.label, blurb: s.blurb, who: s.who, level, you: s.key === 'day' ? 'Yes.' : LEVELS[level].you, tiles };
  }).filter(Boolean);
}
