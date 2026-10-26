// A survey answer showed a concern (safety "no" or average under 3): alert the directors and open an
// improvement action. Used by the public answer page and by surveys typed in by hand in the QA portal.
import 'server-only';
import { SURVEYS } from '@/lib/surveys';

export async function openSurveyConcern(admin, s, answers, score) {
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
  return item?.id ?? null;
}
