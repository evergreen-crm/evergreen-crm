'use server';
// Save a survey answer (public link, no account). Uses the server key: the link's token is the permission.
// A concern (safety "no" or average under 3) alerts the directors and opens an improvement action.
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { cleanAnswers, scoreAnswers } from '@/lib/surveys';
import { openSurveyConcern } from '@/lib/surveyConcern';

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

  if (concern) await openSurveyConcern(admin, s, answers, score);
  return { ok: true };
}
