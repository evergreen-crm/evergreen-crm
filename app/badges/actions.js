'use server';
// Performance badges: Program Manager+ (or HR) set one badge per person per month; staff acknowledge theirs.
// The colour comes from the reasons ticked — the worst reason wins — so badges are consistent and fair.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canHR } from '@/lib/levels';
import { REASONS, colorFor, restartsFor, monthStart } from '@/lib/badges';

const back = (msg, bad, q = '') => redirect(`/badges?${q}${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);

export async function setBadge(fd) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!canHR(profile)) back('Only a Program Manager or above sets badges.', true);
  const person = String(fd.get('profile_id') ?? '');
  const month = String(fd.get('month') ?? '');
  if (!person || !/^\d{4}-\d{2}/.test(month)) back('Choose a person and a month.', true);
  if (person === user.id) back('You cannot set your own badge.', true);
  const valid = new Set(REASONS.map((r) => r.key));
  const reasons = fd.getAll('reasons').map(String).filter((k) => valid.has(k));
  const note = String(fd.get('note') ?? '').trim() || null;
  const color = colorFor(reasons);
  if (color !== 'green' && !note) back('Add a short note explaining the Yellow or Red badge — the staff member will read it.', true, `person=${person}&`);
  const { error } = await supabase.from('staff_badges').upsert({
    profile_id: person, month: monthStart(month), color, reasons, restart: restartsFor(reasons), note,
    set_by: user.id, set_at: new Date().toISOString(), acknowledged_at: null,
  }, { onConflict: 'profile_id,month' });
  if (error) back(error.message, true);
  revalidatePath('/badges'); revalidatePath('/portal');
  back(`Badge saved: ${color.toUpperCase()}.`, false, `person=${person}&`);
}

export async function acknowledgeBadge(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.rpc('acknowledge_badge', { badge: String(fd.get('id') ?? '') });
  if (error) back(error.message, true);
  revalidatePath('/badges'); revalidatePath('/portal');
  back('Thank you — your badge is acknowledged.');
}
