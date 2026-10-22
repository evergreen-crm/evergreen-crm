'use server';
// Help: ask a question, answer one, and (administrators) send a test email.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireUser } from '@/lib/auth';
import { flushOutbox, sendTestEmail } from '@/lib/emailOutbox';
import { HELP_TOPICS } from '@/lib/help';

const s = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null; };
const back = (msg, bad, anchor = '') => redirect(`/help?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}${anchor}`);
const NOT_ON = 'Help questions aren’t switched on yet. Please tell the office (setup file: help-email-gaps.sql).';

export async function askHelp({ topic, message, page }) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  if (!HELP_TOPICS.includes(topic)) return { error: 'Choose what kind of help you need.' };
  if (!message || message.trim().length < 3) return { error: 'Write a few words about what you need.' };
  const { data, error } = await supabase.rpc('ask_for_help', { p_topic: topic, p_message: message.slice(0, 2000), p_page: page ?? null });
  if (error) return { error: /does not exist|Could not find the function/i.test(error.message) ? NOT_ON : error.message };
  after(() => flushOutbox('urgent').catch(() => null));
  revalidatePath('/help');
  return { ok: true, id: data };
}

export async function askHelpForm(fd) {
  const r = await askHelp({ topic: s(fd, 'topic'), message: s(fd, 'message') ?? '', page: s(fd, 'page') ?? '/help' });
  if (r.error) back(r.error, true);
  back('Sent. You’ll get an alert (and an email) when someone answers.', false, '#mine');
}

export async function answerHelp(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = s(fd, 'id');
  const close = fd.get('close') === '1';
  const { error } = await supabase.rpc('answer_help', { p_id: id, p_answer: s(fd, 'answer'), p_close: close });
  if (error) back(error.message, true, `#q-${id}`);
  after(() => flushOutbox('urgent').catch(() => null));
  revalidatePath('/help'); revalidatePath('/todo');
  back(close ? 'Closed.' : 'Answer sent — they’ve been told.', false, `#q-${id}`);
}

export async function testEmail() {
  const { user, profile } = await requireUser(['admin']);
  const r = await sendTestEmail(profile.email || user.email, profile.full_name);
  if (r?.error) back('Test email failed: ' + r.error, true, '#email');
  back(`Test email sent to ${profile.email || user.email}. Check the inbox (and junk folder).`, false, '#email');
}
