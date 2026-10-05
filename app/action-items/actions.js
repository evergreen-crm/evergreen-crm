'use server';
// Action items: scan for problems, create, and move each item through
// Open -> In progress -> Evidence submitted -> Approved -> Closed.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { scanIssues } from '@/lib/actionScan';
import { runDailyJob } from '@/lib/automation';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};
const back = (path, msg, bad) => redirect(`${path}?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);

async function logEvent(supabase, itemId, userId, action, note) {
  await supabase.from('action_item_events').insert({ item_id: itemId, actor_id: userId, action, note: note ?? null });
}

// Find problems and turn each into one action item. Also closes automatic items whose problem has cleared.
export async function scanActionItems() {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (levelOf(profile) < 3) back('/action-items', 'Only a Program Manager or above can run the scan.', true);
  const r = await scanIssues(supabase, user.id);
  if (r.error) back('/action-items', 'Run supabase/kpi-actions.sql in Supabase first. (' + r.error + ')', true);
  revalidatePath('/action-items'); revalidatePath('/portal'); revalidatePath('/kpi');
  back('/action-items', `Scan complete: ${r.created + r.reopened} new, ${r.raised} escalated, ${r.closed} closed automatically.`);
}

// Run the full nightly job now (scan + reminder emails + weekly summary if Monday + monthly snapshot).
export async function runDailyNow() {
  const { user, profile } = await requireUser(['admin', 'manager']);
  if (levelOf(profile) < 4) back('/action-items', 'Only a Director of Operations or above can run the daily job.', true);
  const r = await runDailyJob({ trigger: 'manual', actorId: user.id, forceWeekly: true });
  revalidatePath('/action-items'); revalidatePath('/portal'); revalidatePath('/kpi');
  if (r.error) back('/action-items', r.error, true);
  back('/action-items', `Daily job done: ${r.summary.text}`);
}

// Turn my own reminder emails on or off.
export async function setMyEmailAlerts(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const on = formData.get('on') === '1';
  const { error } = await supabase.rpc('set_my_email_alerts', { on_off: on });
  if (error) back('/action-items', 'Run supabase/kpi-phase2.sql in Supabase first. (' + error.message + ')', true);
  revalidatePath('/action-items');
  back('/action-items', on ? 'Reminder emails are on.' : 'Reminder emails are off. You will still see items here and on the portal.');
}

export async function createActionItem(formData) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (levelOf(profile) < 2) back('/action-items', 'Only a Program Coordinator or above can add action items.', true);
  const title = text(formData, 'title');
  if (!title) back('/action-items/new', 'Describe the issue.', true);
  const { data: row, error } = await supabase.from('action_items').insert({
    title, details: text(formData, 'details'), category: text(formData, 'category') ?? 'compliance',
    severity: text(formData, 'severity') === 'red' ? 'red' : 'yellow', home_id: text(formData, 'home_id'),
    owner_id: text(formData, 'owner_id') ?? user.id, due_date: text(formData, 'due_date'), link: text(formData, 'link'), created_by: user.id,
  }).select('id').single();
  if (error) back('/action-items/new', 'Could not save: ' + error.message, true);
  await logEvent(supabase, row.id, user.id, 'Created', 'Added by hand');
  revalidatePath('/action-items');
  redirect(`/action-items/${row.id}`);
}

export async function updateActionItem(formData) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(formData, 'id');
  const op = text(formData, 'op');
  const note = text(formData, 'note');
  const path = `/action-items/${id}`;
  const lvl = levelOf(profile);
  const { data: item } = await supabase.from('action_items').select('*').eq('id', id).maybeSingle();
  if (!item) back('/action-items', 'That action item was not found.', true);
  const isOwner = item.owner_id === user.id;
  const mgr = lvl >= 3;
  const now = new Date().toISOString();
  let patch = null, event = null;

  switch (op) {
    case 'start':
      if (!isOwner && !mgr) back(path, 'Only the owner can start this.', true);
      patch = { status: 'In progress' }; event = 'Started'; break;
    case 'evidence':
      if (!isOwner && !mgr) back(path, 'Only the owner can submit evidence.', true);
      if (!note) back(path, 'Describe what was done (the evidence).', true);
      patch = { status: 'Evidence submitted', evidence_note: note, evidence_link: text(formData, 'evidence_link'), evidence_by: user.id, evidence_at: now };
      event = 'Evidence submitted'; break;
    case 'approve':
      if (!mgr) back(path, 'Only a Program Manager or above can approve.', true);
      if (profile.role !== 'admin' && (item.owner_id === user.id || item.evidence_by === user.id)) back(path, 'Someone else must approve evidence you submitted.', true);
      patch = { status: 'Approved', approved_by: user.id, approved_at: now }; event = 'Approved'; break;
    case 'close':
      if (!mgr) back(path, 'Only a Program Manager or above can close.', true);
      if (item.status !== 'Approved') back(path, 'Approve the evidence before closing.', true);
      patch = { status: 'Closed', closed_by: user.id, closed_at: now, closed_note: note }; event = 'Closed'; break;
    case 'dismiss':
      if (!mgr) back(path, 'Only a Program Manager or above can dismiss.', true);
      if (!note) back(path, 'Give a reason for dismissing.', true);
      patch = { status: 'Dismissed', closed_by: user.id, closed_at: now, closed_note: note }; event = 'Dismissed'; break;
    case 'reopen':
      if (!mgr) back(path, 'Only a Program Manager or above can reopen.', true);
      patch = { status: 'Open', approved_by: null, approved_at: null, closed_by: null, closed_at: null, closed_note: null }; event = 'Reopened'; break;
    case 'assign': {
      if (!mgr) back(path, 'Only a Program Manager or above can reassign.', true);
      patch = { owner_id: text(formData, 'owner_id'), due_date: text(formData, 'due_date') };
      event = 'Assigned'; break;
    }
    default: back(path, 'Unknown action.', true);
  }
  const { error } = await supabase.from('action_items').update(patch).eq('id', id);
  if (error) back(path, error.message, true);
  await logEvent(supabase, id, user.id, event, note);
  revalidatePath(path); revalidatePath('/action-items'); revalidatePath('/portal');
  back(path, `${event}.`);
}
