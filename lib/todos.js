// "My to-do": one list of everything a person needs to do, built automatically from the records that
// already exist (offer letter, onboarding, training plan, certificates, badges, daily notes, action items,
// approvals). Nobody types tasks in, and a task disappears by itself once the work is done on its own page.
// Used by /todo, the ✅ counter in the top bar and the portal home page, so the numbers match everywhere.
import 'server-only';
import { levelOf, groupOf } from '@/lib/levels';
import { todayISO, addDaysISO } from '@/lib/options';
import { trainingStatus, appliesTo } from '@/lib/onboarding';
import { PLAN_ITEMS } from '@/lib/courses/trainingPlan';

export const BUCKETS = [
  { key: 'overdue', label: 'Overdue', icon: '🔴' },
  { key: 'today', label: 'Today', icon: '🟠' },
  { key: 'week', label: 'This week', icon: '🟡' },
  { key: 'later', label: 'Later', icon: '⚪' },
];

const rows = (res) => (res && !res.error ? res.data ?? [] : []);
const cnt = (res) => (res && !res.error ? res.count ?? 0 : 0);
const none = Promise.resolve({ data: [], count: 0 });

export function bucketOf(due, today = todayISO()) {
  if (!due) return 'week';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return due <= addDaysISO(today, 7) ? 'week' : 'later';
}

const TRACKED = ['academy', 'free', 'inperson'];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Training plan items (90-day plan) that are late or due within 14 days, plus renewals.
export function trainingTodos({ hire, program, level, records, today, personId, self }) {
  const out = [];
  const soon = addDaysISO(today, 14);
  for (const it of PLAN_ITEMS) {
    if (!TRACKED.includes(it.kind) || it.ifApplicable || !appliesTo(it.program, program) || (it.leaders && level < 2)) continue;
    const s = trainingStatus(records, it.title, today);
    if (s.key === 'ok') continue;
    if (s.key === 'pending') continue; // waiting for a manager to verify — not the staff member's job
    if (s.key === 'soon' || s.key === 'expired') {
      out.push({ key: `tr:${personId}:${it.title}`, kind: 'training', icon: '🎓', title: `Renew: ${it.label ?? it.title}`,
        detail: s.label, href: it.href ?? '/academy', due: s.last?.expires_on ?? today });
      continue;
    }
    if (!hire) continue;
    const due = addDaysISO(hire, it.day);
    if (due > soon) continue;
    out.push({ key: `tr:${personId}:${it.title}`, kind: 'training', icon: '🎓', title: it.label ?? it.title,
      detail: it.who ?? `${it.minutes ? `About ${it.minutes >= 60 ? `${Math.round(it.minutes / 6) / 10} h` : `${it.minutes} min`}` : ''}`.trim(),
      href: self ? (it.href ?? '/academy/plan') : `/academy/plan?person=${personId}`, due });
  }
  return out;
}

// More than 3 training items → one line, so the list stays short (the full plan is one tap away).
function collapseTraining(items, href, today) {
  if (items.length <= 3) return items;
  const late = items.filter((t) => t.due && t.due < today).length;
  const first = items.map((t) => t.due).filter(Boolean).sort()[0] ?? today;
  return [{ key: `tr-all:${href}`, kind: 'training', icon: '🎓', title: `${plural(items.length, 'training item', 'training items')} to finish${late ? ` (${late} late)` : ''}`,
    detail: items.slice(0, 3).map((t) => t.title).join(' · ') + ' …', href, due: first }];
}

// Everything on one person's own list.
export async function getMyTodos(supabase, profile) {
  if (!profile || profile.role === 'family') return [];
  const me = profile.id;
  const lvl = levelOf(profile);
  const grp = groupOf(profile);
  const hr = grp === 'hr' || profile.role === 'admin';
  const homeId = profile.home_id;
  const today = todayISO();
  const in30 = addDaysISO(today, 30);
  const lead = lvl >= 3 || profile.role === 'admin';

  const [offers, onb, certs, sd, recs, badges, myDrafts, actions,
    houseDrafts, critical, timesheets, probation, checklist, promos, toVerify, myLists, lateLists, permReqs, sosOpen, gaps, helpQs] = await Promise.all([
    supabase.from('offer_letters').select('id, position, respond_by, issued_at').eq('profile_id', me).eq('status', 'Sent'),
    supabase.from('onboarding_items').select('id, title, due_date, status, review_note').eq('profile_id', me).in('status', ['To do', 'Returned']).order('due_date'),
    supabase.from('certifications').select('id, cert_type, expires_on').eq('profile_id', me).not('expires_on', 'is', null).lte('expires_on', in30),
    supabase.from('staff_details').select('hire_date, program').eq('profile_id', me).maybeSingle(),
    supabase.from('trainings').select('id, title, completed_on, expires_on, verified_by').eq('profile_id', me),
    supabase.from('staff_badges').select('id, month, color, set_at').eq('profile_id', me).is('acknowledged_at', null),
    supabase.from('shift_notes').select('id, note_date, resident_id').eq('author_id', me).is('signed_at', null).order('note_date'),
    supabase.from('action_items').select('id, source_key, title, details, link, due_date, severity, status').eq('owner_id', me).in('status', ['Open', 'In progress']),
    lvl === 2 && homeId && !grp
      ? supabase.from('shift_notes').select('id, residents!inner(home_id)', { count: 'exact', head: true }).is('signed_at', null).lt('note_date', today).neq('author_id', me).eq('residents.home_id', homeId)
      : none,
    lvl >= 2 && !grp
      ? (lead ? supabase.from('incidents').select('id, occurred_on, home_id') : supabase.from('incidents').select('id, occurred_on, home_id').eq('home_id', homeId ?? '00000000-0000-0000-0000-000000000000'))
        .eq('is_critical', true).is('verbal_report_at', null).eq('status', 'Open').order('occurred_on')
      : none,
    lead || grp === 'payroll'
      ? supabase.from('time_entries').select('id', { count: 'exact', head: true }).not('clock_out', 'is', null).is('approved_by', null).neq('profile_id', me)
      : none,
    lvl >= 2 && !grp
      ? supabase.from('probation_due_list').select('review_id, review, staff_id, staff_name, completed_by, due_date, home_id, review_status, probation_status').in('review_status', ['Overdue', 'Due this week']).in('probation_status', ['On probation', 'Extended'])
      : none,
    lvl >= 4
      ? supabase.from('launch_checklist_due').select('id, plan_id, item, min_level, due_date').is('done_on', null).eq('not_applicable', false).gte('min_level', 4).lte('min_level', lvl).order('sort').limit(15)
      : none,
    lead ? supabase.from('staff_promotions').select('id', { count: 'exact', head: true }).in('status', ['Requested', 'Recommended', 'Board review']).neq('staff_id', me) : none,
    hr ? supabase.from('onboarding_items').select('id', { count: 'exact', head: true }).eq('status', 'Submitted').neq('profile_id', me) : none,
    supabase.from('shift_checklist_board').select('id, shift, shift_date, ends_at, items, answered, home_name').eq('profile_id', me).eq('status', 'Open').gte('shift_date', addDaysISO(today, -3)),
    lvl >= 2 && !grp
      ? (lead ? supabase.from('shift_checklist_board').select('id, home_id, shift_date') : supabase.from('shift_checklist_board').select('id, home_id, shift_date').eq('home_id', homeId ?? '00000000-0000-0000-0000-000000000000'))
        .eq('board_status', 'Late').neq('profile_id', me).gte('shift_date', addDaysISO(today, -7))
      : none,
    lvl >= 2 ? supabase.from('shift_permission_requests').select('id', { count: 'exact', head: true }).eq('status', 'Pending').neq('profile_id', me) : none,
    lvl >= 2 ? supabase.from('emergency_alerts').select('id, kind', { count: 'exact' }).is('resolved_at', null).gte('created_at', new Date(Date.now() - 3 * 864e5).toISOString()) : none,
    // Missing details (supabase/record-gaps.sql): leaders see what they're responsible for; everyone sees their own.
    supabase.from('record_gaps').select('id, kind, subject_id, label, due_on, stage').is('fixed_at', null),
    lvl >= 2 || profile.role === 'admin' ? supabase.from('help_requests').select('id, created_at').eq('status', 'Open').neq('profile_id', me) : none,
  ]);

  const list = [];
  for (const o of rows(offers)) list.push({ key: `offer:${o.id}`, kind: 'hr', icon: '✍️', title: `Read and sign your offer letter (${o.position})`,
    detail: o.respond_by ? 'Please respond by the date shown' : null, href: `/offer/${o.id}`, due: o.respond_by ?? today });
  for (const i of rows(onb)) list.push({ key: `onb:${i.id}`, kind: 'onboarding', icon: '📝',
    title: i.status === 'Returned' ? `Fix and send again: ${i.title}` : i.title, detail: i.status === 'Returned' ? (i.review_note ?? 'HR sent this back') : 'Onboarding',
    href: '/onboarding', due: i.status === 'Returned' ? (i.due_date && i.due_date < today ? i.due_date : today) : i.due_date });
  for (const c of rows(certs)) list.push({ key: `cert:${c.id}`, kind: 'hr', icon: '📜', title: `${c.expires_on < today ? 'Expired' : 'Renew'}: ${c.cert_type}`,
    detail: 'Upload the new certificate', href: `/hr/${me}`, due: c.expires_on });
  list.push(...collapseTraining(trainingTodos({ hire: sd.data?.hire_date, program: sd.data?.program ?? 'Both', level: lvl, records: rows(recs), today, personId: me, self: true }), '/academy/plan', today));
  for (const b of rows(badges)) list.push({ key: `badge:${b.id}`, kind: 'badge', icon: b.color === 'red' ? '🔴' : b.color === 'yellow' ? '🟡' : '🟢',
    title: 'Look at your monthly badge and tap “I have seen this”', detail: null, href: '/badges', due: addDaysISO((b.set_at ?? today).slice(0, 10), 7) });
  const drafts = rows(myDrafts);
  if (drafts.length) list.push({ key: 'mydrafts', kind: 'care', icon: '🖊', title: `Sign ${plural(drafts.length, 'daily note', 'daily notes')} you started`,
    detail: 'A note is not final until you sign it', href: `/residents/${drafts[0].resident_id}?tab=notes`, due: drafts[0].note_date });

  for (const c of rows(myLists)) {
    const late = new Date(c.ends_at).getTime() < Date.now();
    const left = (c.items ?? 0) - (c.answered ?? 0);
    list.push({ key: `cl:${c.id}`, kind: 'care', icon: '📋', title: late ? `Sign your ${c.shift} shift checklist (${c.shift_date})` : `Finish and sign your ${c.shift} shift checklist`,
      detail: `${c.home_name} · ${left > 0 ? `${left} item${left > 1 ? 's' : ''} left` : 'all ticked — just sign'}`, href: `/checklist?id=${c.id}`, due: late ? addDaysISO(today, -1) : today });
  }
  const ll = rows(lateLists);
  if (ll.length) list.push({ key: 'cl-late', kind: 'care', icon: '📋', title: `${plural(ll.length, 'shift checklist', 'shift checklists')} not signed by staff`,
    detail: 'Follow up with the staff member', href: `/checklist?view=house${homeId && !lead ? `&home=${homeId}` : ''}`, due: addDaysISO(today, -1) });

  const seen = new Set();
  for (const r of rows(probation)) {
    const mine = lead ? r.completed_by === 'Program Manager' : r.completed_by === 'Program Coordinator' && r.home_id === homeId;
    if (!mine || r.staff_id === me) continue;
    seen.add(`prob:${r.review_id}`);
    list.push({ key: `prob:${r.review_id}`, kind: 'approval', icon: '📝', title: `${r.review} for ${r.staff_name}`, detail: 'Probation review', href: `/probation/${r.review_id}`, due: r.due_date });
  }
  for (const a of rows(actions)) {
    if (a.source_key && seen.has(a.source_key)) continue;
    list.push({ key: `act:${a.id}`, kind: 'action', icon: a.severity === 'red' ? '⚠️' : '📌', title: a.title, detail: a.details?.slice(0, 140) ?? null,
      href: a.link || `/action-items/${a.id}`, due: a.due_date ?? (a.severity === 'red' ? today : null) });
  }
  const hd = cnt(houseDrafts);
  if (hd) list.push({ key: 'housedrafts', kind: 'care', icon: '🖊', title: `${plural(hd, 'daily note', 'daily notes')} from past shifts not signed at your house`,
    detail: 'Remind the staff who wrote them', href: homeId ? `/homes/${homeId}?tab=residents` : '/homes', due: addDaysISO(today, -1) });
  const crit = rows(critical);
  if (crit.length) list.push({ key: 'critical', kind: 'urgent', icon: '🚨', title: `Record the MCFD/CLBC notice for ${plural(crit.length, 'critical incident', 'critical incidents')}`,
    detail: 'Phone right away for serious incidents; written report within 24 hours', href: homeId && !lead ? `/homes/${homeId}?tab=dashboard` : '/homes', due: crit[0].occurred_on < today ? crit[0].occurred_on : today });
  const ts = cnt(timesheets);
  if (ts) list.push({ key: 'timesheets', kind: 'approval', icon: '⏱', title: `Approve ${plural(ts, 'timesheet', 'timesheets')}`, detail: null, href: '/timesheet', due: today });
  for (const c of rows(checklist)) list.push({ key: `lc:${c.id}`, kind: 'approval', icon: '🚀', title: c.item, detail: 'Launch plan sign-off',
    href: `/launch/${c.plan_id}?tab=checklist&f=todo`, due: c.due_date });
  const pr = cnt(promos);
  if (pr) list.push({ key: 'promos', kind: 'approval', icon: '🌱', title: `${plural(pr, 'promotion request', 'promotion requests')} waiting`, detail: null, href: '/careers#requests', due: null });
  {
    const g = rows(gaps);
    const mine = g.filter((x) => x.kind === 'staff' && x.subject_id === me);
    const others = (lvl >= 2 || hr) ? g.filter((x) => !(x.kind === 'staff' && x.subject_id === me)) : [];
    if (others.length) {
      const late = others.filter((x) => x.due_on < today).length;
      const people = new Set(others.map((x) => x.subject_id)).size;
      list.push({ key: 'gaps', kind: 'hr', icon: '🧩', title: `${plural(others.length, 'missing detail', 'missing details')} to fill in (${plural(people, 'record', 'records')})${late ? ` — ${late} overdue` : ''}`,
        detail: late ? 'Overdue items are reported to the Director of Operations; after a month to the ED and CEO' : 'Hire dates, programs, contacts, house details — due within 1 week',
        href: '/records', due: others.map((x) => x.due_on).sort()[0] });
    }
    if (mine.length) list.push({ key: 'gaps-me', kind: 'hr', icon: '🧩', title: 'Your staff record is missing some details',
      detail: mine.map((x) => x.label).join(' · ') + ' — tell your Program Coordinator', href: '/records', due: mine.map((x) => x.due_on).sort()[0] });
  }
  const hq = rows(helpQs);
  if (hq.length) list.push({ key: 'helpq', kind: 'approval', icon: '❓', title: `${plural(hq.length, 'staff question', 'staff questions')} waiting for an answer`,
    detail: 'Help requests from staff', href: '/help#answer', due: today });
  const sos = rows(sosOpen);
  if (sos.length) list.push({ key: 'sos', kind: 'urgent', icon: '🆘', title: `${plural(sos.length, 'emergency alert', 'emergency alerts')} open: ${[...new Set(sos.map((x) => x.kind))].join(', ')}`,
    detail: 'Check in with the staff member, then mark it handled', href: '/approvals#emergencies', due: addDaysISO(today, -1) });
  const pr2 = cnt(permReqs);
  if (pr2) list.push({ key: 'perm', kind: 'approval', icon: '🙋', title: `${plural(pr2, 'staff member is', 'staff members are')} waiting for your OK to clock in or out`,
    detail: 'Approve or decline', href: '/approvals', due: addDaysISO(today, -1) });
  const tv = cnt(toVerify);
  if (tv) list.push({ key: 'verify', kind: 'approval', icon: '🔎', title: `Check ${plural(tv, 'onboarding document', 'onboarding documents')} staff sent in`, detail: 'Verify or return each one', href: '/hr', due: today });

  return sortTodos(list, today);
}

export function sortTodos(list, today = todayISO()) {
  const order = { overdue: 0, today: 1, week: 2, later: 3 };
  return list.map((t) => ({ ...t, bucket: bucketOf(t.due, today) }))
    .sort((a, z) => order[a.bucket] - order[z.bucket] || (a.due ?? '9').localeCompare(z.due ?? '9'));
}

export const todoCount = (list) => ({ total: list.length, overdue: list.filter((t) => t.bucket === 'overdue').length });

// Team view: who is behind. Program Manager+ see staff below their level; HR sees everyone.
export async function getTeamTodos(supabase, profile) {
  const lvl = levelOf(profile);
  const hr = groupOf(profile) === 'hr' || profile.role === 'admin';
  if (lvl < 3 && !hr) return null;
  const today = todayISO();
  const in30 = addDaysISO(today, 30);
  const [people, sds, onb, certs, recs, badges, offers, drafts, lists] = await Promise.all([
    supabase.from('profiles').select('id, full_name, level, role, staff_group, home_id, email').in('role', ['staff', 'manager', 'admin']).eq('active', true).neq('id', profile.id).order('full_name'),
    supabase.from('staff_details').select('profile_id, hire_date, program'),
    supabase.from('onboarding_items').select('id, profile_id, title, due_date, status').in('status', ['To do', 'Returned']).lte('due_date', addDaysISO(today, 7)),
    supabase.from('certifications').select('id, profile_id, cert_type, expires_on').not('expires_on', 'is', null).lte('expires_on', in30),
    supabase.from('trainings').select('profile_id, title, completed_on, expires_on, verified_by'),
    supabase.from('staff_badges').select('id, profile_id, set_at').is('acknowledged_at', null),
    supabase.from('offer_letters').select('id, profile_id, position, respond_by').eq('status', 'Sent'),
    supabase.from('shift_notes').select('id, author_id, note_date, resident_id').is('signed_at', null).lt('note_date', today),
    supabase.from('shift_checklist_board').select('id, profile_id, shift, shift_date').eq('board_status', 'Late').gte('shift_date', addDaysISO(today, -14)),
  ]);
  const by = (list, k) => rows(list).reduce((m, x) => ((m[x[k]] ??= []).push(x), m), {});
  const SD = Object.fromEntries(rows(sds).map((s) => [s.profile_id, s]));
  const ONB = by(onb, 'profile_id'), CERT = by(certs, 'profile_id'), REC = by(recs, 'profile_id'), BADGE = by(badges, 'profile_id'), OFFER = by(offers, 'profile_id'), DRAFT = by(drafts, 'author_id'), LIST = by(lists, 'profile_id');

  const team = rows(people).filter((p) => hr || lvl >= 5 || levelOf(p) < lvl).map((p) => {
    const items = [];
    for (const o of OFFER[p.id] ?? []) items.push({ key: `offer:${o.id}`, icon: '✍️', title: `Sign offer letter (${o.position})`, href: `/offer/${o.id}`, due: o.respond_by ?? today });
    for (const i of ONB[p.id] ?? []) items.push({ key: `onb:${i.id}`, icon: '📝', title: i.status === 'Returned' ? `Fix and resend: ${i.title}` : i.title, href: `/hr/${p.id}`, due: i.due_date });
    for (const c of CERT[p.id] ?? []) items.push({ key: `cert:${c.id}`, icon: '📜', title: `${c.expires_on < today ? 'Expired' : 'Renew'}: ${c.cert_type}`, href: `/hr/${p.id}`, due: c.expires_on });
    items.push(...collapseTraining(trainingTodos({ hire: SD[p.id]?.hire_date, program: SD[p.id]?.program ?? 'Both', level: levelOf(p), records: REC[p.id] ?? [], today, personId: p.id, self: false }), `/academy/plan?person=${p.id}`, today));
    for (const b of BADGE[p.id] ?? []) items.push({ key: `badge:${b.id}`, icon: '🏅', title: 'Has not seen their monthly badge', href: '/badges', due: addDaysISO((b.set_at ?? today).slice(0, 10), 7) });
    for (const c of LIST[p.id] ?? []) items.push({ key: `cl:${c.id}`, icon: '📋', title: `Shift checklist not signed (${c.shift}, ${c.shift_date})`, href: `/checklist?id=${c.id}`, due: c.shift_date });
    const d = DRAFT[p.id] ?? [];
    if (d.length) items.push({ key: `drafts:${p.id}`, icon: '🖊', title: `${plural(d.length, 'unsigned daily note', 'unsigned daily notes')}`, href: `/residents/${d[0].resident_id}?tab=notes`, due: d[0].note_date });
    const sorted = sortTodos(items, today);
    return { ...p, items: sorted, ...todoCount(sorted) };
  }).filter((p) => p.total > 0)
    .sort((a, z) => z.overdue - a.overdue || z.total - a.total || (a.full_name ?? '').localeCompare(z.full_name ?? ''));
  return team;
}
