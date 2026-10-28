// The Evergreen Community Care menu, defined once.
//  · Home shows the same first four for everyone: Clock in / out, Emergency, Sick, My ID card.
//    Then up to four tiles for the person's role. A tile opens a short list (/go/<key>) or goes straight to its page.
//  · More holds the rest, in plain groups. Each page appears once.
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
  const lead = lvl >= 2 && !grp;   // Program Coordinator and up
  const mgr = lvl >= 3 && !grp;    // Program Manager and up

  // ---------- Hubs: what opens from a tile ----------
  const hubs = {
    clock: { label: 'Clock in / out', icon: '⏰', sub: 'Start and end your shift', items: [
      L('Clock in / out', '/id#checkin', '⏰'), L('My hours', '/timesheet', '⏱')] },
    emergency: { label: 'Emergency', icon: '🆘', sub: 'Missing youth · on-call · 911', tone: 'red', items: [
      L('Missing youth', '/missing', '🔎'),
      ...(ctx.onCall ? [L(`Call on-call: ${ctx.onCall}`, `tel:${String(ctx.onCall).replace(/[^\d+]/g, '')}`, '📞')] : []),
      L('Call 911', 'tel:911', '🚑')],
      note: 'The red 🆘 button at the bottom of every screen alerts your leaders straight away.' },
    sick: { label: 'Sick / can’t work', icon: '🤒', sub: 'Tell us before your shift', items: [
      L('I’m sick', '/absence?kind=Sick&pay=bc', '🤒'),
      L('Running late', '/absence', '🏃'),
      L('Can’t make my shift', '/absence', '📞'),
      L('Family emergency', '/absence?kind=Family%20emergency&pay=other', '🏠')] },
    idcard: { label: 'My ID card', icon: '🪪', sub: 'Show at the door', items: [L('My ID card', '/id', '🪪')] },
    shift: { label: 'Documentation', icon: '📝', sub: 'Records by section', items: [
      L('Document records (by section)', '/document', '📝'), L('Shift log & handover', houseHref('commbook'), '📒'), L('Missing youth', '/missing', '🔎')] },
    schedule: { label: 'Schedule', icon: '🗓', sub: 'Shifts · pick up · time off', items: [
      L('30-day calendar', '/schedule', '🗓'), L('Open shifts to pick up', '/schedule?tab=open', '🙋'),
      L('Time off', '/schedule?tab=timeoff', '🌴'), ...(lead ? [L('Staffing (1 or 2 per shift)', '/schedule?tab=teams', '👥')] : [])] },
    house: { label: 'My house', icon: '🏡', sub: 'Residents · records · reports', items: [
      L('House dashboard', houseHref('dashboard'), '🏡'), L('Residents', houseHref('residents'), '👥'),
      L('Document records (by section)', '/document', '📝'), L('Inventory register', (home ? `/homes/${home}/inventory` : '/homes'), '📦'),
      ...(lead ? [L('Print a report', '/reports/daily', '🖨')] : [])] },
    approvals: { label: 'Approvals', icon: '✅', sub: 'Waiting for me', badge: ctx.approvals || null, items: [
      L('Clock-in permission & alerts', '/approvals', '🙋'), L('Shift swaps', '/schedule?tab=open', '🔁'),
      L('Time off', '/schedule?tab=timeoff', '🌴'), ...(mgr ? [L('Timesheets', '/timesheet', '⏱')] : [])] },
    houses: { label: 'Houses', icon: '🏡', sub: 'Every house · schedule · records', items: [
      L('All houses', '/homes', '🏡'), L('Overview', '/dashboard', '📊'), L('Schedule (all houses)', '/schedule', '🗓'),
      L('Staffing (1 or 2 per shift)', '/schedule?tab=teams', '👥'), L('Staff on shift now', '/checkins', '📍')] },
    people: { label: 'People', icon: '👥', sub: 'Staff files · reviews · training', items: [
      ...(hr || mgr ? [L('Staff files', '/hr', '👥')] : []), L('First 90 days', '/probation', '📝'),
      L('Training (Evergreen Community Care Academy)', '/academy', '🎓'), L('Badges', '/badges', '🏅')] },
    payroll: { label: 'Payroll', icon: '💵', sub: 'Hours · sick days', items: [
      L('Staff hours (timesheets)', '/timesheet', '💵'), L('Sick days & attendance', '/attendance', '🤒')] },
    quality: { label: 'Quality & reports', icon: '📈', sub: 'KPIs · reports', items: [
      L('How we’re doing (KPIs)', '/kpi', '📈'), ...(lvl >= 4 && !grp ? [L('Quality assurance', '/qa', '🏅')] : []),
      ...(lead ? [L('Print a report', '/reports/daily', '🖨')] : [])] },
  };

  // ---------- Home tiles: the four essentials, then the role's own ----------
  const essentials = [
    { key: 'clock', href: '/id#checkin' }, { key: 'emergency' }, { key: 'sick' }, { key: 'idcard' }];
  const T = (key, href) => ({ key, ...hubs[key], href: href ?? `/go/${key}` });
  let roleTiles;
  if (grp === 'hr') roleTiles = ['people', 'schedule'];
  else if (grp === 'payroll') roleTiles = ['payroll', 'schedule'];
  else if (mgr) roleTiles = ['houses', 'shift', 'approvals', 'people'];
  else if (lead) roleTiles = ['shift', 'house', 'approvals', 'schedule'];
  else roleTiles = ['shift', 'schedule'];
  const tiles = [...essentials.map((e) => T(e.key, e.href)), ...roleTiles.map((k) => T(k))];

  // ---------- More: the rest, in plain groups ----------
  const more = [
    { title: 'Me', items: [
      L('My to-do', '/todo', '✅'), L('Alerts', '/notifications', '🔔'), L('Documents to sign', '/sign', '✍️'),
      L('Policies', '/policies', '📘'), L('Ask Evergreen Community Care (help)', '/ask', '🤖')] },
    ...(lead || hr || pay || isAdmin ? [{ title: 'Reports & admin', items: [
      ...(mgr ? [L('Quality & reports', '/kpi', '📈')] : []),
      ...(pay && !mgr ? [L('Payroll', '/timesheet', '💵')] : []),
      ...(isAdmin ? [L('Admin', '/admin', '⚙️')] : [])] }] : []),
  ].filter((g) => g.items.length);

  // ---------- Everything, once, for 🔍 Find ----------
  const seen = new Set();
  const all = [];
  const add = (it, where) => { const k = it.href.split('#')[0] + '|' + it.label; if (it.href.startsWith('tel:') || seen.has(k)) return; seen.add(k); all.push({ ...it, where }); };
  for (const t of tiles) { add({ label: t.label, href: t.href, icon: t.icon }, 'Home'); for (const it of hubs[t.key].items) add(it, t.label); }
  for (const g of more) for (const it of g.items) add(it, g.title);
  return { tiles, hubs, more, all };
}
