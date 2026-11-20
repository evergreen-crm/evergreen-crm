// Start a person's onboarding checklist (with the training plan and due dates from the hire date).
// Used by HR's "Start onboarding" button and automatically when someone is hired from a pre-screen.
import { SECTIONS, appliesTo } from '@/lib/onboarding';
import { addDaysISO } from '@/lib/options';

export async function createOnboarding(client, { profileId, hire, program, sentBy }) {
  const { data: onb, error } = await client.from('onboardings').insert({
    profile_id: profileId, hire_date: hire, due_date: addDaysISO(hire, 30), sent_by: sentBy, program,
  }).select('id').single();
  if (error) return { error: error.code === '23505' ? 'This person already has an onboarding checklist.' : 'Could not start onboarding: ' + error.message };
  const rows = [];
  for (const s of SECTIONS) s.items.filter((it) => appliesTo(it.program, program)).forEach((it, i) => rows.push({
    onboarding_id: onb.id, profile_id: profileId, section: s.key, item_key: it.key, title: it.title,
    sort: i, due_date: addDaysISO(hire, it.days ?? 30), status: 'To do',
  }));
  const { error: e2 } = await client.from('onboarding_items').insert(rows);
  if (e2) return { error: 'Could not create checklist: ' + e2.message };
  await client.from('staff_details').upsert({ profile_id: profileId, hire_date: hire, program, updated_at: new Date().toISOString() });
  await client.from('staff_details').update({ program_confirmed: true }).eq('profile_id', profileId);
  return { ok: true, id: onb.id, items: rows.length };
}
