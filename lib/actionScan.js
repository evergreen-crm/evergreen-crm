// The "Check for new issues" scan, shared by the button on /action-items and the nightly automatic run.
// Turns each problem into one action item, updates/escalates existing ones, reopens a problem that
// came back, and closes automatic items whose problem has cleared.
import 'server-only';
import { loadKpiData, detectIssues, pickOwner } from '@/lib/kpis';

async function logEvent(supabase, itemId, actorId, action, note) {
  await supabase.from('action_item_events').insert({ item_id: itemId, actor_id: actorId ?? null, action, note: note ?? null });
}

// supabase: a signed-in client (button) or the admin client (nightly run). actorId: who ran it (null = automatic).
// Pass `data` if the KPI data is already loaded.
export async function scanIssues(supabase, actorId, data) {
  const d = data ?? await loadKpiData(supabase);
  const issues = detectIssues(d);
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
      link: iss.link ?? null, due_date: iss.due_date ?? null, owner_id: pickOwner(iss, d.profiles, d.kpiOwners), created_by: actorId ?? null,
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
