'use server';
// Save the extra details the official form needs, add a "who was notified" row, and mark the form sent.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';

const t = (f, k, n = 4000) => { const v = f.get(k); return typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null; };
const yn = (f, k) => (f.get(k) === 'yes' ? true : f.get(k) === 'no' ? false : null);
const back = (id, msg, bad) => redirect(`/incidents/${id}/form?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);
// Local Vancouver date+time from the form → ISO.
function localToIso(date, time) {
  if (!date) return null;
  const guess = new Date(`${date}T${time || '12:00'}:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone: 'America/Vancouver' }));
  return new Date(guess.getTime() + (guess.getTime() - local.getTime())).toISOString();
}

export async function saveFormDetails(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const id = t(formData, 'id', 40);
  const { error } = await supabase.from('incidents').update({
    location: t(formData, 'location', 300), contributing: t(formData, 'contributing'), people_involved: t(formData, 'people_involved', 2000),
    police_involved: yn(formData, 'police_involved'), police_file: t(formData, 'police_file', 60),
    coroner_involved: yn(formData, 'coroner_involved'), coroner_file: t(formData, 'coroner_file', 60),
    addressed: t(formData, 'addressed'), prevention: t(formData, 'prevention'), prepared_by: user.id,
  }).eq('id', id);
  if (error) back(id, error.message, true);
  revalidatePath(`/incidents/${id}/form`); back(id, 'Saved. The form below is updated.');
}

export async function addNotified(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = t(formData, 'id', 40);
  const name = t(formData, 'name', 120);
  if (!name) back(id, 'Enter who was notified.', true);
  const { data: inc } = await supabase.from('incidents').select('notified').eq('id', id).maybeSingle();
  if (!inc) back(id, 'Incident not found.', true);
  const row = { name, role: t(formData, 'role', 120), org: t(formData, 'org', 120), at: localToIso(t(formData, 'date', 10), t(formData, 'time', 5)), method: t(formData, 'method', 40), copy: yn(formData, 'copy') };
  const list = [...(Array.isArray(inc.notified) ? inc.notified : []), row].slice(0, 30);
  const { error } = await supabase.from('incidents').update({ notified: list }).eq('id', id);
  if (error) back(id, error.message, true);
  revalidatePath(`/incidents/${id}/form`); back(id, `Added ${name}.`);
}

export async function removeNotified(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = t(formData, 'id', 40), i = Number(formData.get('i'));
  const { data: inc } = await supabase.from('incidents').select('notified').eq('id', id).maybeSingle();
  const list = (Array.isArray(inc?.notified) ? inc.notified : []).filter((_, k) => k !== i);
  await supabase.from('incidents').update({ notified: list }).eq('id', id);
  revalidatePath(`/incidents/${id}/form`); back(id, 'Removed.');
}

// Program Coordinators, Program Managers and directors send the form (Help page rules).
export async function markFormSent(formData) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const id = t(formData, 'id', 40);
  if (levelOf(profile) < 2 && profile.role !== 'admin') back(id, 'Your Program Coordinator or Manager sends the form. Tell them it is ready.', true);
  const to = t(formData, 'sent_to', 300);
  if (!to) back(id, 'Enter who you sent it to (name and email).', true);
  const { error } = await supabase.from('incidents').update({ form_sent_at: new Date().toISOString(), form_sent_by: user.id, form_sent_to: to }).eq('id', id);
  if (error) back(id, error.message, true);
  revalidatePath(`/incidents/${id}/form`); back(id, 'Marked sent. The countdown has stopped.');
}
