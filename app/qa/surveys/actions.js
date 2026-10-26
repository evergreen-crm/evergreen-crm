'use server';
// QA portal → Surveys: send a survey now (by email, or in person for a youth), type in a survey answered
// on paper or by phone, and cancel a survey that is waiting. Directors only (level 4+).
// survey_sends has no insert/update rule for the app, so these use the server key after the level check.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canSeeQa } from '@/lib/qa';
import { SURVEYS, cleanAnswers, scoreAnswers } from '@/lib/surveys';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { sendEmail, emailReady } from '@/lib/email';
import { surveyEmail } from '@/lib/surveyJob';
import { openSurveyConcern } from '@/lib/surveyConcern';

const t = (f, k, n = 300) => { const v = f.get(k); return typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null; };
const uuid = (v) => (/^[0-9a-f-]{36}$/i.test(v ?? '') ? v : null);
const okEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e ?? '');
const back = (q) => redirect('/qa/surveys?' + q);

async function gate() {
  const r = await requireUser(['admin', 'manager']);
  if (!canSeeQa(r.profile)) redirect('/');
  if (!adminKey()) back('error=' + encodeURIComponent('The server key is missing in Vercel, so surveys cannot be saved.'));
  return { ...r, admin: createAdminClient() };
}

export async function sendSurveyNow(formData) {
  const { user, admin } = await gate();
  const key = t(formData, 'survey_key', 20);
  if (!SURVEYS[key]) back('error=' + encodeURIComponent('Choose which survey to send.'));
  const name = t(formData, 'recipient_name', 120);
  const email = t(formData, 'recipient_email', 200)?.toLowerCase() ?? null;
  const inPerson = key === 'youth';
  if (!name) back('send=1&error=' + encodeURIComponent('Enter the person’s name.'));
  if (!inPerson && !okEmail(email)) back('send=1&error=' + encodeURIComponent('Enter a valid email address (youth surveys are done in person and need no email).'));
  const { data: s, error } = await admin.from('survey_sends').insert({
    survey_key: key, reason: t(formData, 'reason', 80) ?? 'Sent by hand', dedupe_key: `manual:${crypto.randomUUID()}`,
    home_id: uuid(t(formData, 'home_id', 40)), resident_id: uuid(t(formData, 'resident_id', 40)),
    recipient_name: name, recipient_email: inPerson ? null : email, status: inPerson ? 'Waiting' : 'Sent',
    sent_at: inPerson ? null : new Date().toISOString(),
  }).select('id, survey_key, token, recipient_name, recipient_email, expires_at').single();
  if (error) back('send=1&error=' + encodeURIComponent('Could not create the survey: ' + error.message));
  revalidatePath('/qa/surveys');
  if (inPerson) redirect(`/surveys/${s.id}`); // opens the in-person page to do it with the youth now
  if (!emailReady()) back('ok=' + encodeURIComponent('Survey created, but email is not set up, so it was not emailed.'));
  const r = await sendEmail({ to: email, ...surveyEmail(s, false) });
  back(r?.error ? 'error=' + encodeURIComponent(`Survey created, but the email failed: ${r.error}`) : 'ok=' + encodeURIComponent(`Survey emailed to ${name}. It shows below as "Sent" until they answer.`));
}

export async function enterSurveyByHand(formData) {
  const { user, admin } = await gate();
  const key = t(formData, 'survey_key', 20);
  const def = SURVEYS[key];
  if (!def) back('error=' + encodeURIComponent('Choose which survey you are entering.'));
  const raw = {};
  for (const q of def.questions) { const v = t(formData, 'q_' + q.id, 5); if (v) raw[q.id] = q.yesno ? v : Number(v); }
  const answers = cleanAnswers(key, raw);
  if (!Object.keys(answers).length) back(`enter=${key}&error=` + encodeURIComponent('Answer at least one question.'));
  const { score, concern } = scoreAnswers(key, answers);
  const how = t(formData, 'how', 40) ?? 'Paper';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(t(formData, 'answered_on', 10) ?? '') ? t(formData, 'answered_on', 10) : null;
  const when = date ? new Date(date + 'T19:00:00Z').toISOString() : new Date().toISOString();
  const { data: s, error } = await admin.from('survey_sends').insert({
    survey_key: key, reason: `${how} (entered by hand)`, dedupe_key: `manual:${crypto.randomUUID()}`,
    home_id: uuid(t(formData, 'home_id', 40)), resident_id: uuid(t(formData, 'resident_id', 40)),
    recipient_name: t(formData, 'recipient_name', 120) ?? 'Anonymous', status: 'Completed',
    created_at: when, sent_at: when, opened_at: when, completed_at: when,
    answers, score, concern, comments: t(formData, 'comments', 3000),
  }).select('id, survey_key, home_id, resident_id, homes(name)').single();
  if (error) back(`enter=${key}&error=` + encodeURIComponent('Could not save: ' + error.message));
  if (concern) await openSurveyConcern(admin, s, answers, score);
  revalidatePath('/qa/surveys');
  back('ok=' + encodeURIComponent(`Survey saved (average ${score ?? '—'} of 5).` + (concern ? ' It showed a concern, so an improvement action was opened.' : '')) + '#list');
}

export async function cancelSurvey(formData) {
  const { admin } = await gate();
  const id = uuid(t(formData, 'id', 40));
  await admin.from('survey_sends').update({ status: 'Cancelled' }).eq('id', id).in('status', ['Waiting', 'Sent']);
  revalidatePath('/qa/surveys');
  back('ok=' + encodeURIComponent('Survey cancelled.') + '#list');
}
