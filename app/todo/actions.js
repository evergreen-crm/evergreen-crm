'use server';
// My to-do: a manager or HR sends a staff member a reminder (portal notification + email when set up).
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { sendEmail, emailReady } from '@/lib/email';

const back = (msg, bad) => redirect(`/todo?view=team&${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function remindStaff(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = String(fd.get('profile_id') ?? '');
  const items = fd.getAll('item').map(String).filter(Boolean).slice(0, 10);
  const body = items.length ? `Please finish: ${items.join('; ')}.` : null;
  const { data: sent, error } = await supabase.rpc('send_todo_reminder', { p_profile: id, p_body: body });
  if (error) back(/function .* does not exist|Could not find the function/i.test(error.message) ? 'Reminders are not switched on yet. An administrator needs to run supabase/todo-reminders.sql in Supabase.' : error.message, true);
  if (!sent) back('A reminder was already sent to this person today.', true);
  let mailed = false;
  if (emailReady()) {
    const { data: p } = await supabase.from('profiles').select('full_name, email').eq('id', id).maybeSingle();
    if (p?.email) {
      const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://evergreen-crm-azure.vercel.app';
      const r = await sendEmail({
        to: p.email,
        subject: 'Evergreen: you have tasks to finish',
        text: `Hi ${p.full_name},\n\nYou have tasks waiting in the Evergreen portal.\n${items.map((i) => `- ${i}`).join('\n')}\n\nOpen My to-do: ${site}/todo\n\nEvergreen Community Care`,
        html: `<p>Hi ${esc(p.full_name)},</p><p>You have tasks waiting in the Evergreen portal:</p><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul><p><a href="${site}/todo">Open My to-do</a></p><p>Evergreen Community Care</p>`,
      });
      mailed = !r.error;
    }
  }
  back(`Reminder sent${mailed ? ' (portal and email)' : ' in the portal'}.`);
}
