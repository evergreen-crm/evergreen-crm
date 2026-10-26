'use server';
// Save a resident file audit. A score under 90%, or any "No", opens an improvement action (COA GLS) for the house's PM/PC.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canSeeQa, FILE_AUDIT_ITEMS, auditScore } from '@/lib/qa';
import { addDaysISO, todayISO } from '@/lib/options';
import { levelOf } from '@/lib/levels';

export async function saveAudit(formData) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager']);
  if (!canSeeQa(profile)) redirect('/');
  const residentId = String(formData.get('resident_id') ?? '');
  const { data: r } = await supabase.from('residents').select('id, home_id, first_name, last_name, preferred_name').eq('id', residentId).maybeSingle();
  if (!r) redirect('/qa/audits?error=' + encodeURIComponent('Choose a resident.'));
  const answers = {};
  for (const i of FILE_AUDIT_ITEMS) { const v = formData.get(i.id); if (['yes', 'no', 'na'].includes(v)) answers[i.id] = v; }
  if (Object.keys(answers).length < FILE_AUDIT_ITEMS.length) redirect(`/qa/audits?new=${residentId}&error=` + encodeURIComponent('Answer every item (Yes, No or N/A).'));
  const score = auditScore(answers);
  const findings = String(formData.get('findings') ?? '').trim().slice(0, 4000) || null;
  const audit_date = /^\d{4}-\d{2}-\d{2}$/.test(formData.get('audit_date') ?? '') ? formData.get('audit_date') : todayISO();
  const { data: row, error } = await supabase.from('qa_file_audits').insert({ resident_id: r.id, home_id: r.home_id, audit_date, answers, score, findings }).select('id').single();
  if (error) redirect('/qa/audits?error=' + encodeURIComponent(error.message));

  const missed = FILE_AUDIT_ITEMS.filter((i) => answers[i.id] === 'no');
  if (missed.length || (score ?? 100) < 90) {
    const name = r.preferred_name || r.first_name;
    // Owner: the house's Program Coordinator, else the PM, else the auditor.
    const { data: staff } = await supabase.from('profiles').select('id, level, role, staff_group, home_id').eq('active', true).eq('home_id', r.home_id);
    const owner = (staff ?? []).find((p) => levelOf(p) === 2 && !p.staff_group)?.id ?? user.id;
    const { data: act } = await supabase.from('action_items').insert({
      title: `GLS: File audit for ${name} scored ${score}%`, category: 'qa', severity: (score ?? 100) < 75 ? 'red' : 'yellow',
      home_id: r.home_id, resident_id: r.id, owner_id: owner, due_date: addDaysISO(todayISO(), 30), link: `/residents/${r.id}`, created_by: user.id,
      details: ['Items to fix:', ...missed.map((i) => `• ${i.text}`), findings && `\nAuditor notes: ${findings}`].filter(Boolean).join('\n'),
    }).select('id').single();
    if (act) {
      await supabase.from('qa_file_audits').update({ action_id: act.id }).eq('id', row.id);
      await supabase.from('action_item_events').insert({ item_id: act.id, actor_id: user.id, action: 'Created', note: 'From a resident file audit (QA portal)' });
    }
  }
  revalidatePath('/qa/audits');
  redirect('/qa/audits?ok=' + encodeURIComponent(`Audit saved: ${score}%.` + (missed.length ? ' An improvement action was opened for the items marked No.' : '')));
}
