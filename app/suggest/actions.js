'use server';
// 💡 Send a suggestion (any staff member), and answer one (directors, level 4+).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canSeeQa } from '@/lib/qa';
import { SUGGESTION_KINDS, SUGGESTION_STATUSES } from '@/lib/suggestions';
import { addDaysISO, todayISO } from '@/lib/options';

const s = (fd, k, n = 3000) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null; };
const NOT_ON = 'Suggestions aren’t switched on yet. Please tell the office (setup file: suggestions-surveys.sql).';

export async function sendSuggestion({ kind, message, anonymous, page }) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  if (!SUGGESTION_KINDS.some((k) => k.key === kind)) return { error: 'Choose what kind it is.' };
  if (!message || message.trim().length < 3) return { error: 'Write a few words.' };
  const { error } = await supabase.rpc('submit_suggestion', { p_kind: kind, p_message: message.slice(0, 3000), p_anonymous: !!anonymous, p_page: page ?? null });
  if (error) return { error: /does not exist|Could not find the function/i.test(error.message) ? NOT_ON : error.message };
  revalidatePath('/suggest'); revalidatePath('/qa/suggestions');
  return { ok: true };
}

export async function sendSuggestionForm(fd) {
  const r = await sendSuggestion({ kind: s(fd, 'kind', 40), message: s(fd, 'message') ?? '', anonymous: fd.get('anonymous') === 'on', page: '/suggest' });
  redirect(`/suggest?${r.error ? 'error=' + encodeURIComponent(r.error) : 'ok=' + encodeURIComponent('Thank you! Your suggestion was sent to the directors.')}`);
}

export async function answerSuggestion(fd) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager']);
  if (!canSeeQa(profile)) redirect('/');
  const id = s(fd, 'id', 40);
  const status = SUGGESTION_STATUSES.includes(s(fd, 'status', 20)) ? s(fd, 'status', 20) : 'Reviewing';
  const response = s(fd, 'response');
  const { data: row, error } = await supabase.from('suggestions')
    .update({ status, response, responded_by: user.id, responded_at: new Date().toISOString() })
    .eq('id', id).select('id, kind, message, home_id, submitted_by, action_id').single();
  if (error) redirect('/qa/suggestions?error=' + encodeURIComponent(error.message));
  let extra = '';
  if (fd.get('make_action') === 'on' && !row.action_id) {
    const { data: act } = await supabase.from('action_items').insert({
      title: `PQI: Staff ${row.kind.toLowerCase()} — ${row.message.slice(0, 120)}`, category: 'qa', severity: row.kind === 'Concern' ? 'red' : 'yellow',
      details: `From a staff suggestion:\n${row.message}${response ? `\n\nResponse: ${response}` : ''}`, home_id: row.home_id,
      owner_id: s(fd, 'action_owner', 40) ?? user.id, due_date: addDaysISO(todayISO(), 30), link: '/qa/suggestions', created_by: user.id,
    }).select('id').single();
    if (act) {
      await supabase.from('suggestions').update({ action_id: act.id }).eq('id', row.id);
      await supabase.from('action_item_events').insert({ item_id: act.id, actor_id: user.id, action: 'Created', note: 'From a staff suggestion (QA portal)' });
      extra = ' An improvement action was opened.';
    }
  }
  // The sender is alerted by a database trigger (only when they sent it with their name).
  revalidatePath('/qa/suggestions'); revalidatePath('/suggest');
  redirect('/qa/suggestions?ok=' + encodeURIComponent('Saved.' + extra) + `#g-${row.id}`);
}
