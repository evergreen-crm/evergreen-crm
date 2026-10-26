'use server';
// Save a survey answer (public link, no account). Uses the server key: the link's token is the permission.
// A concern (safety "no" or average under 3) alerts the directors and opens an improvement action.
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { SURVEYS, cleanAnswers, scoreAnswers } from '@/lib/surveys';

const validToken = (t) => typeof t === 'string' && /^[0-9a-f]{40,80}$/i.test(t);

export async function submitSurvey(token, raw, comments) {
  if (!validToken(token) || !adminKey()) return { error: 'This link is not valid.' };
  const admin = createAdminClient();
  const { data: s } = await admin.from('survey_sends').select('id, survey_key, status, expires_at, home_id, resident_id, homes(name)').eq('token', token).maybeSingle();
  if (!s) return { error: 'This link is not valid.' };
  if (s.status === 'Completed') return { error: 'This survey was already answered. Thank you!' };
  if (!['Sent', 'Waiting'].includes(s.status) || new Date(s.expires_at) < new Date()) return { error: 'This survey has closed. Thank you for your interest.' };
  const answers = cleanAnswers(s.survey_key, raw);
  if (!Object.keys(answers).length) return { error: 'Please answer at least one question.' };
  const { score, concern } = scoreAnswers(s.survey_key, answers);
  const text = typeof comments === 'string' ? comments.trim().slice(0, 3000) || null : null;
  const { error } = await admin.from('survey_sends').update({ status: 'Completed', completed_at: new Date().toISOString(), answers, score, concern, comments: text })
    .eq('id', s.id).in('status', ['Sent', 'Waiting']);
  if (error) return { error: 'Could not save. Please try again.' };

  if (concern) {
    const def = SURVEYS[s.survey_key];
    const where = s.homes?.name ? ` — ${s.homes.name}` : '';
    const { data: directors } = await admin.from('profiles').select('id, level, role, staff_group').eq('active', true).gte('level', 4).is('staff_group', null);
    const owner = (directors ?? []).filter((d) => d.role !== 'admin').sort((a, b) => a.level - b.level)[0] ?? (directors ?? [])[0];
    const { data: item } = await admin.from('action_items').insert({
      title: `CR: Survey concern from ${def.audience.toLowerCase()}${where}`,
      details: `A ${def.title.toLowerCase()} answer showed a concern (average ${score ?? '—'} of 5${answers.safe === 'no' ? ', answered NO to the safety question' : ''}).\nReview the answers in the QA portal → Surveys, follow up, and record what was done.`,
      category: 'qa', severity: answers.safe === 'no' ? 'red' : 'yellow', home_id: s.home_id, resident_id: s.resident_id,
      owner_id: owner?.id ?? null, due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), link: '/qa/surveys', auto: false,
      source_key: `survey:${s.id}`,
    }).select('id').single();
    if (item) await admin.from('survey_sends').update({ followup_id: item.id }).eq('id', s.id);
    for (const d of directors ?? []) {
      await admin.from('notifications').upsert({ profile_id: d.id, title: `⚠️ Survey concern${where}`, body: `${def.audience}: average ${score ?? '—'} of 5${answers.safe === 'no' ? ' · safety answered NO' : ''}. An improvement action was opened.`, link: '/qa/surveys', dedupe_key: `survey-concern:${s.id}:${d.id}` }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
    }
  }
  return { ok: true };
}
