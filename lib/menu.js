// The whole CRM menu, defined once (Melvin, Oct 26 2026: "the menu is so clumsy — make it easy for staff and management").
//  · Home shows about 8 big TILES (managers 9: 🎓 Evergreen Academy added Oct 26) for the person's role. A tile opens a short list of what's inside (/go/<key>)
//    or goes straight to its page.
//  · Everything else is under MORE, in plain groups. Each page appears once, under one name.
//  · 🔍 Find searches every page this person can open.
// Who sees what follows the access levels (lib/levels.js); pages still check access themselves.
import { levelOf, groupOf, canHR, canPayroll } from '@/lib/levels';

const L = (label, href, icon, extra = {}) => ({ label, href, icon, ...extra });

export function buildMenu(profile, ctx = {}) {
  if (!profile || profile.role === 'family') return { tiles: [], hubs: {}, more: [], all: [] };
  const lvl = levelOf(profile);
  const grp = groupOf(profile);
  const isAdmin = profile.role === 'admin';
  const home = ctx.homeId ?? profile.home_id ?? null;
  const houseHref = (tab) => (home ? `/homes/${home}${tab ? `?tab=${tab}` : ''}` : '/homes');
  const hr = canHR(profile), pay = canPayroll(profile);
  const lead = lvl >= 2 && !grp;          // Program Coordinator and up (not HR / Payroll)
  const mgr = lvl >= 3 && !grp;           // Program Manager and up

  // ---------- Hubs: what's inside each tile ----------
  const hubs = {
    clock: { label: 'Clock In – Clock Out', icon: '⏰', sub: 'Start and end your shift at the house', items: [
      L('Clock In / Clock Out', '/id#checkin', '⏰'), L('Running late', '/absence', '🏃'), L('Can’t make my shift', '/absence', '📞'), L('My hours', '/timesheet', '⏱')] },
    shift: { label: 'My shift', icon: '📋', sub: 'Checklist · notes · meds · incident', items: [
      L('📝 Document records (by section)', '/document', '📝'), L('Shift checklist', '/checklist', '📋'), L('Daily notes', '/notes', '📝'), L('Medication — open the youth', '/portal#my-youth', '💊'),
      L('Report an incident — open the youth', '/portal#my-youth', '⚠️'), L('Shift log & handover', houseHref('commbook'), '📒'), L('Missing youth', '/missing', '🔎')] },
    sick: { label: 'Sick', icon: '🤒', sub: 'Call in sick · other', items: [
      L('I’m sick', '/absence?kind=Sick&pay=bc', '🤒'),
      L('Other: unpaid · vacation · banked time', '/absence?kind=Sick&pay=other', '🗂'),
      L('Family emergency', '/absence?kind=Family%20emergency&pay=other', '🏠'),
      L('Running late', '/absence', '🏃')] },
    schedule: { label: lead && !mgr ? 'My schedule & hours' : 'My schedule', icon: '🗓', sub: 'Shifts · pick up · time off', items: [
      L('30-day calendar', '/schedule', '🗓'), L('My 6 months', '/schedule?tab=mine', '📆'), L('Open shifts to pick up', '/schedule?tab=open', '🙋'), L('Can’t make my shift', '/absence', '📞'),
      L('Time off', '/schedule?tab=timeoff', '🌴'), ...(lead && !mgr ? [L('My hours', '/timesheet', '⏱')] : [])] },
    hours: { label: 'My hours', icon: '⏱', sub: 'Timesheet · pay period', items: [
      L('My timesheet', '/timesheet', '⏱')] },
    training: { label: 'Evergreen Academy', icon: '🎓', sub: 'Courses · 90-day plan · certificates', items: [
      L('Evergreen Academy — courses', '/academy', '🎓'), L('My 90-day plan', '/academy/plan', '📅'), L('My certificates', `/hr/${profile.id}`, '🪪'),
      ...(lvl >= 6 || isAdmin ? [L('Course videos (upload)', '/academy/videos', '🎬')] : []),
      L('Policies to read', '/policies', '📘'), L('Ask Evergreen — policy questions', '/ask', '🤖'), L('Documents to sign', '/sign', '✍️')] },
    emergency: { label: 'Emergency', icon: '🆘', sub: 'SOS · missing youth · on-call', tone: 'red', items: [
      L('Missing youth', '/missing', '🔎'),
      ...(ctx.onCall ? [L(`Call on-call: ${ctx.onCall}`, `tel:${String(ctx.onCall).replace(/[^\d+]/g, '')}`, '📞')] : []),
      L('Call 911', 'tel:911', '🚑'), ...(lead ? [L('Approvals & 🆘 alerts', '/approvals', '🙋')] : [])],
      note: 'The red 🆘 button at the bottom of every screen alerts your leaders straight away.' },
    house: { label: 'My house', icon: '🏡', sub: 'Residents · notes · attendance', items: [
      L('📝 Document records (by section)', '/document', '📝'), L('House dashboard', houseHref('dashboard'), '🏡'), L('Residents', houseHref('residents'), '👥'), L('Attendance today', '/attendance', '⏰'),
      L('Fire drill & safety check', houseHref('safety'), '🔥'), L('Open shifts', '/schedule?tab=open', '🙋'), L('House schedule (30 days)', '/schedule', '🗓'), L('👥 Staffing: 1 or 2 staff per shift', `/schedule?tab=teams${home ? `&home=${home}` : ''}`, '👥'),
      L('Calendar', '/calendar', '📅'), L('Problems to fix', '/action-items', '⚠️'), L('Missing details', '/records', '🧩'),
      L('Print documentation', '/reports/daily', '🖨'), L('First-90-days reviews', '/probation', '📝'), L('Badges', '/badges', '🏅'), L('Monthly QA review', '/review', '🗓')] },
    approvals: { label: 'Approvals', icon: '✅', sub: mgr ? 'Everything waiting on me' : 'Swaps · time off · no-shows', badge: ctx.approvals || null, items: [
      L('Clock in / out permission & 🆘', '/approvals', '🙋'), L('Possible no-shows', '/attendance', '⏰'), L('Shift swaps', '/schedule?tab=open', '🔁'),
      L('Time off', '/schedule?tab=timeoff', '🌴'), ...(mgr ? [L('Timesheets', '/timesheet', '⏱'), L('Shifts that need cover', '/attendance', '📞'), L('Promotions', '/careers', '🌱')] : []),
      L('Problems to fix', '/action-items', '⚠️')] },
    houses: { label: 'My houses', icon: '🏡', sub: 'Every house · residents', items: [
      L('All houses', '/homes', '🏡'), L('👥 Staffing: 1 or 2 staff per shift', '/schedule?tab=teams', '👥'), L('Overview', '/dashboard', '📊'), L('Portal (all divisions)', '/portal', '🏛'), L('Calendar', '/calendar', '📅'),
      L('Staff on shift now', '/checkins', '📍'), L('Missing youth', '/missing', '🔎')] },
    attendance: { label: 'Schedule & attendance', icon: '🗓', sub: 'Who’s in · cover needed', items: [
      L('Attendance today', '/attendance', '⏰'), L('Schedules (30 days)', '/schedule', '🗓'), L('👥 Staffing: 1 or 2 staff per shift', '/schedule?tab=teams', '👥'), L('Open shifts & swaps', '/schedule?tab=open', '🙋'),
      L('Time off requests', '/schedule?tab=timeoff', '🌴'), L('Timesheets', '/timesheet', '⏱')] },
    people: { label: 'People', icon: '👥', sub: 'HR · hiring · reviews · badges', items: [
      ...(hr || mgr ? [L('HR & staff files', '/hr', '👥')] : []), ...(ctx.psRole ? [L('Job applicants', '/hr/prescreen', '🧾')] : []),
      L('First-90-days reviews', '/probation', '📝'), L('Performance badges', '/badges', '🏅'), L('Missing details', '/records', '🧩'), L('Career & promotions', '/careers', '🌱')] },
    quality: { label: 'Quality', icon: '📈', sub: 'KPIs · COA · reports', items: [
      L('How we’re doing (KPIs)', '/kpi', '📈'), ...(lvl >= 4 && !grp ? [L('Quality assurance (COA)', '/qa', '🏅')] : []),
      ...(lead && lvl <= 7 && !isAdmin ? [L('Monthly QA review', '/review', '🗓')] : []), L('Print documentation', '/reports/daily', '🖨'), L('Problems to fix', '/action-items', '⚠️')] },
    referrals: { label: 'Referrals & new houses', icon: '📨', sub: 'Intake · opening a house', items: [
      L('New referrals', '/intake', '📨'), L('Opening a new house', '/launch', '🚀')] },
    payroll: { label: 'Payroll', icon: '💵', sub: 'Hours · sick days · schedules', items: [
      L('Staff hours (timesheets)', '/timesheet', '💵'), L('Sick days & attendance', '/attendance', '🤒'), L('Schedules', '/schedule', '🗓')] },
  };

  // ---------- Tiles per role (max 8) ----------
  const T = (key, href) => ({ key, ...hubs[key], href: href ?? `/go/${key}` });
  let tiles;
  if (grp === 'hr') tiles = [T('people'), T('training'), T('clock', '/id#checkin'), T('sick'), T('schedule'), T('emergency')];
  else if (grp === 'payroll') tiles = [T('payroll'), T('clock', '/id#checkin'), T('sick'), T('schedule'), T('training'), T('emergency')];
  else if (mgr) tiles = [T('houses'), T('approvals'), T('attendance'), T('people'), T('quality'), T('training'), ...(['admin', 'manager'].includes(profile.role) ? [T('referrals')] : []), T('clock', '/id#checkin'), T('emergency')];
  else if (lvl === 2) tiles = [T('clock', '/id#checkin'), T('shift'), T('sick'), T('house'), T('approvals'), T('schedule'), T('training'), T('emergency')];
  else tiles = [T('clock', '/id#checkin'), T('shift'), T('sick'), T('schedule'), T('hours'), T('training'), T('emergency')];

  // ---------- More ----------
  const more = [
    { title: 'Me', items: [
      L('My to-do', '/todo', '✅'), L('Alerts', '/notifications', '🔔'), L('My ID card', '/id', '🪪'),
      ...(ctx.onboarding ? [L('My onboarding', '/onboarding', '✅')] : []),
      ...(profile.role === 'staff' && !hr ? [L('My HR file', `/hr/${profile.id}`, '📁')] : []),
      ...(mgr ? [L('Sick / can’t make my shift', '/absence', '🤒')] : []),
      L('Documents to sign', '/sign', '✍️'), L('Policies', '/policies', '📘'), L('Career & perks', '/careers', '🌱'),
      ...(lvl < 2 && !hr ? [L('My first 90 days', '/probation', '📝')] : []), L('My suggestions', '/suggest', '💡')] },
    ...(mgr || isAdmin || (pay && !mgr) ? [{ title: 'Manage', items: [
      ...(pay && !mgr ? [L('Payroll — staff hours', '/timesheet', '💵')] : []),
      ...(isAdmin ? [L('Admin', '/admin', '⚙️')] : []),
      ...(mgr ? [L('Staff on shift now', '/checkins', '📍'), L('Overview', '/dashboard', '📊'), L('Portal (all divisions)', '/portal', '🏛')] : [])] }] : []),
    { title: 'Help', items: [L('Ask Evergreen (AI helper)', '/ask', '🤖'), L(lvl >= 2 ? 'Help & questions' : 'Help', '/help', '❓'), L('What does this word mean?', '/words', '📖'), L('Install the app', '/install', '📲')] },
  ].filter((g) => g.items.length);

  // ---------- Everything, once, for 🔍 Find ----------
  const seen = new Set();
  const all = [];
  const add = (it, where) => { const k = it.href.split('#')[0] + '|' + it.label; if (it.href.startsWith('tel:') || seen.has(k)) return; seen.add(k); all.push({ ...it, where }); };
  for (const t of tiles) { add({ label: t.label, href: t.href, icon: t.icon }, 'Home'); for (const it of hubs[t.key].items) add(it, t.label); }
  for (const g of more) for (const it of g.items) add(it, g.title);
  return { tiles, hubs, more, all };
}
