// The "Check for new issues" scan, shared by the button on /action-items and the nightly automatic run.
// Turns each problem into one action item, updates/escalates existing ones, reopens a problem that
// came back, and closes automatic items whose problem has cleared.
import 'server-only';
import { loadKpiData, detectIssues, pickOwner } from '@/lib/kpis';
import { levelOf, groupOf } from '@/lib/levels';

// Probation reviews and pre-opening launch documents that are overdue or due within 7 days
// (supabase/launch-people.sql). Returns [] if those tables aren't set up yet.
const ROLE_LEVEL = { 'Program Coordinator': 2, 'Program Manager': 3, 'Director of Operations': 4, 'Executive Director': 5, CSO: 6, CEO: 7 };
async function launchAndProbationIssues(supabase, profiles) {
  const out = [];
  const staff = (profiles ?? []).filter((p) => p.active && p.role !== 'family');
  const byLevel = (lvl, home) => staff.find((p) => !groupOf(p) && levelOf(p) === lvl && (!home || p.home_id === home))
    ?? staff.find((p) => !groupOf(p) && levelOf(p) >= Math.max(lvl, 3));
  try {
    const { data: reviews } = await supabase.from('probation_due_list').select('*').in('review_status', ['Overdue', 'Due this week'])
      .in('probation_status', ['On probation', 'Extended']);
    for (const r of reviews ?? []) {
      const final = r.completed_by === 'Program Manager';
      out.push({
        source_key: `prob:${r.review_id}`, category: 'hr', severity: r.review_status === 'Overdue' ? 'red' : 'yellow',
        title: `${r.review} for ${r.staff_name}${final ? ' (final — confirm full-time?)' : ''}`,
        details: `Probation review due ${r.due_date}. ${final ? 'Program Manager decides: confirm full-time, extend, or end employment.' : 'Completed by the Program Coordinator.'}`,
        home_id: r.home_id ?? null, subject_profile_id: r.staff_id, link: `/probation/${r.review_id}`, due_date: r.due_date,
        owner_id: (final ? byLevel(3) : byLevel(2, r.home_id))?.id ?? null,
      });
    }
    const { data: docs } = await supabase.from('launch_documents_due').select('*').in('due_status', ['Overdue', 'Due this week']);
    for (const x of docs ?? []) {
      const hr = x.owner_role === 'HR' ? staff.find((p) => groupOf(p) === 'hr') : null;
      out.push({
        source_key: `ldoc:${x.document_id}`, category: x.requirement === 'MCFD required' ? 'mcfd' : 'compliance',
        severity: x.due_status === 'Overdue' || x.requirement !== 'Best practice' ? (x.due_status === 'Overdue' ? 'red' : 'yellow') : 'yellow',
        title: `Before opening ${x.care_setting_name ?? x.service_type}: ${x.document}`,
        details: `${x.requirement}. Due ${x.due_date} (${x.owner_role}). ${x.source_notes ?? ''}`.trim(),
        link: `/launch/${x.plan_id}?tab=documents&f=late`, due_date: x.due_date,
        owner_id: (hr ?? byLevel(ROLE_LEVEL[x.owner_role] ?? 3))?.id ?? null,
      });
    }
  } catch { /* tables not created yet */ }
  return out;
}

async function logEvent(supabase, itemId, actorId, action, note) {
  await supabase.from('action_item_events').insert({ item_id: itemId, actor_id: actorId ?? null, action, note: note ?? null });
}

// supabase: a signed-in client (button) or the admin client (nightly run). actorId: who ran it (null = automatic).
// Pass `data` if the KPI data is already loaded.
export async function scanIssues(supabase, actorId, data) {
  const d = data ?? await loadKpiData(supabase);
  const issues = [...detectIssues(d), ...await launchAndProbationIssues(supabase, d.profiles)];
  const { data: existing, error } = await supabase.from('action_items').select('id, source_key, status, severity, auto, title').not('source_key', 'is', null);
  if (error) return { error: error.message };

  const byKey = Object.fromEntries((existing ?? []).map((x) => [x.source_key, x]));
  const now = new Date().toISOString();
  const who = actorId ? 'Found by the check' : 'Found by the nightly automatic check';
  let created = 0, closed = 0, raised = 0, reopened = 0;

  for (const iss of issues) {
    const ex = byKey[iss.source_key];
    if (ex) {
      if (['Closed', 'Dismissed'].includes(ex.status)) {
        // The same problem is back after being closed: reopen it.
        if (ex.auto && ex.status === 'Closed') {
          await supabase.from('action_items').update({ status: 'Open', title: iss.title, details: iss.details ?? null, severity: iss.severity, due_date: iss.due_date, approved_by: null, approved_at: null, closed_by: null, closed_at: null, closed_note: null }).eq('id', ex.id);
          await logEvent(supabase, ex.id, actorId, 'Reopened', 'The problem is showing again'); reopened++;
        }
        continue;
      }
      if (ex.severity !== iss.severity || ex.title !== iss.title) {
        await supabase.from('action_items').update({ severity: iss.severity, title: iss.title, details: iss.details ?? null, due_date: iss.due_date }).eq('id', ex.id);
        if (iss.severity === 'red' && ex.severity !== 'red') { raised++; await logEvent(supabase, ex.id, actorId, 'Escalated to red', 'Now overdue'); }
      }
      continue;
    }
    const { data: row, error: insErr } = await supabase.from('action_items').insert({
      source_key: iss.source_key, auto: true, title: iss.title, details: iss.details ?? null, category: iss.category, severity: iss.severity,
      home_id: iss.home_id ?? null, resident_id: iss.resident_id ?? null, subject_profile_id: iss.subject_profile_id ?? null,
      link: iss.link ?? null, due_date: iss.due_date ?? null, owner_id: iss.owner_id ?? pickOwner(iss, d.profiles, d.kpiOwners), created_by: actorId ?? null,
    }).select('id').single();
    if (!insErr && row) { created++; await logEvent(supabase, row.id, actorId, 'Created', who); }
  }

  const live = new Set(issues.map((i) => i.source_key));
  for (const ex of existing ?? []) {
    if (ex.auto && ex.status === 'Open' && !live.has(ex.source_key)) {
      await supabase.from('action_items').update({ status: 'Closed', closed_at: now, closed_by: actorId ?? null, closed_note: 'Resolved — the problem is no longer showing in the records.' }).eq('id', ex.id);
      await logEvent(supabase, ex.id, actorId, 'Auto-closed', 'The problem cleared in the records');
      closed++;
    }
  }
  return { created, raised, closed, reopened, data: d };
}
