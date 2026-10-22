'use server';
// 🔎 Missing youth or adult: start, log steps, found, close. Every change goes through a database function
// (supabase/missing-youth.sql) so each step is logged with the time and the person.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireUser } from '@/lib/auth';
import { flushOutbox } from '@/lib/emailOutbox';

const s = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null; };
const NOT_ON = 'The missing-person log isn’t switched on yet. Call on-call now and follow the missing plan on paper. (Setup file: missing-youth.sql.)';
const msg = (e) => (/does not exist|Could not find the function/i.test(e?.message ?? '') ? NOT_ON : e.message);
const emailNow = () => after(() => flushOutbox('urgent').catch(() => null));

// Last-seen time typed as local (Vancouver) date + time → ISO with offset.
function lastSeen(fd) {
  const d = s(fd, 'seen_date'); const t = s(fd, 'seen_time');
  if (!d || !t) return null;
  const guess = new Date(`${d}T${t}:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone: 'America/Vancouver' }));
  const offset = guess.getTime() - local.getTime();
  return new Date(guess.getTime() + offset).toISOString();
}

export async function startMissing(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const resident = s(fd, 'resident_id');
  const { data, error } = await supabase.rpc('start_missing', {
    p_resident: resident, p_last_seen_at: lastSeen(fd), p_where: s(fd, 'where'), p_with: s(fd, 'with'),
    p_clothing: s(fd, 'clothing'), p_higher_risk: fd.get('higher_risk') === 'on', p_risk_notes: s(fd, 'risk_notes'),
  });
  if (error) redirect(`/missing/new?resident=${resident ?? ''}&error=${encodeURIComponent(msg(error))}`);
  emailNow();
  revalidatePath('/missing');
  redirect(`/missing/${data}?ok=${encodeURIComponent('Missing log started. Leaders have been alerted. Keep searching and tick each step.')}`);
}

export async function missingStep(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = s(fd, 'id');
  const { error } = await supabase.rpc('missing_step', { p_episode: id, p_step: s(fd, 'step'), p_note: s(fd, 'note'), p_extra: s(fd, 'extra') });
  revalidatePath(`/missing/${id}`);
  redirect(`/missing/${id}?${error ? 'error=' + encodeURIComponent(msg(error)) : 'ok=Logged.'}#steps`);
}

export async function missingFound(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = s(fd, 'id');
  const { error } = await supabase.rpc('missing_found', { p_episode: id, p_where: s(fd, 'where'), p_notes: s(fd, 'notes') });
  if (!error) emailNow();
  revalidatePath(`/missing/${id}`); revalidatePath('/missing');
  redirect(`/missing/${id}?${error ? 'error=' + encodeURIComponent(msg(error)) : 'ok=' + encodeURIComponent('Marked as back. Welcome them calmly, check for injuries, and tell everyone who was told.')}`);
}

export async function missingClose(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = s(fd, 'id');
  const { error } = await supabase.rpc('missing_close', { p_episode: id, p_debrief: s(fd, 'debrief') });
  revalidatePath(`/missing/${id}`); revalidatePath('/missing');
  redirect(`/missing/${id}?${error ? 'error=' + encodeURIComponent(msg(error)) : 'ok=Closed.'}`);
}
