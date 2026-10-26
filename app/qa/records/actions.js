'use server';
// 📝 Save QA records (committee meetings, risk register, inspections, root cause analysis, QA plan,
// stakeholder feedback, quarterly sign-off). Stored in `records` under division 'coa' (level 4+ only,
// enforced by has_division in the database). Optionally opens an improvement action for the follow-up.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canSeeQa, findQaRecordType, QA_DIVISION, QA_RECORD_STATUSES, riskScore } from '@/lib/qa';
import { addDaysISO, todayISO } from '@/lib/options';

const text = (f, k, n = 4000) => { const v = f.get(k); return typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null; };
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '');
async function gate() { const r = await requireUser(['admin', 'manager']); if (!canSeeQa(r.profile)) redirect('/'); return r; }

export async function saveQaRecord(formData) {
  const { supabase, user } = await gate();
  const type = findQaRecordType(text(formData, 'type', 40));
  if (!type) redirect('/qa/records?error=' + encodeURIComponent('Unknown record type.'));
  const back = text(formData, 'back', 200) ?? `/qa/records/${type.key}`;
  const [backPath, backHash] = back.split('#');
  const fail = (msg) => redirect(`${backPath}${backPath.includes('?') ? '&' : '?'}error=${encodeURIComponent(msg)}${backHash ? '#' + backHash : ''}`);
  const id = text(formData, 'id', 40);

  const data = {};
  for (const f of type.fields) {
    const v = text(formData, 'f_' + f.name);
    if (v === null) { if (f.required) fail(`Fill in "${f.label}".`); continue; }
    if (f.type === 'number') { const n = Number(v); if (!Number.isNaN(n)) data[f.name] = n; }
    else if (f.type === 'date') { if (isDate(v)) data[f.name] = v; }
    else if (f.type === 'select') { if (f.options.includes(v)) data[f.name] = v; }
    else data[f.name] = v;
  }
  if (type.key === 'risks') { const r = riskScore(data); if (r) { data.score = r.score; data.level = r.level; } }

  const title = text(formData, 'title', 300);
  if (!title) fail('Give the record a short title.');
  const recordType = text(formData, 'record_type', 120);
  if (type.types?.length && !type.types.includes(recordType)) fail('Choose a type.');
  const recordDate = isDate(text(formData, 'record_date')) ? text(formData, 'record_date') : todayISO();
  let due = isDate(text(formData, 'due_date')) ? text(formData, 'due_date') : null;
  if (!id && !due && type.dueDays) due = addDaysISO(recordDate, type.dueDays);
  const status = QA_RECORD_STATUSES.includes(text(formData, 'status')) ? text(formData, 'status') : 'Open';

  const row = {
    record_type: recordType, title, record_date: recordDate, due_date: due, status,
    home_id: text(formData, 'home_id', 40),
    resident_id: type.resident ? text(formData, 'resident_id', 40) : null,
    data,
  };

  let recordId = id;
  if (id) {
    const { data: out, error } = await supabase.from('records')
      .update({ ...row, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', id).eq('division', QA_DIVISION).eq('area', type.key).select('id');
    if (error) fail('Could not save: ' + error.message);
    if (!out?.length) fail('Could not save: this record was not found, or you do not have permission. (Has supabase/qa-records.sql been run?)');
  } else {
    const { data: out, error } = await supabase.from('records')
      .insert({ ...row, division: QA_DIVISION, area: type.key, visibility: 'managers', created_by: user.id })
      .select('id').single();
    if (error) fail('Could not save: ' + (/row-level security/i.test(error.message) ? 'permission denied — run supabase/qa-records.sql in Supabase first.' : error.message));
    recordId = out.id;
  }

  // Optional: open an improvement action (shows on the owner's to-do list and on /qa/actions).
  let actionMsg = '';
  if (formData.get('make_action') === 'on') {
    const std = String(type.coa).split(/[ ·]+/)[0];
    const followUp = data.follow_up ?? data.actions ?? data.plan ?? data.response ?? null;
    const { data: act, error: aErr } = await supabase.from('action_items').insert({
      title: `${std}: ${title}`.slice(0, 200), category: 'qa',
      severity: (type.key === 'risks' && riskScore(data)?.tone === 'red') || data.result === 'Not passed' ? 'red' : 'yellow',
      details: [`From the QA record "${type.title}".`, followUp && `\n${followUp}`].filter(Boolean).join('\n'),
      home_id: row.home_id, resident_id: row.resident_id, owner_id: text(formData, 'action_owner', 40) ?? user.id,
      due_date: due ?? addDaysISO(todayISO(), 30), link: `/qa/records/${type.key}?edit=${recordId}`, created_by: user.id,
    }).select('id').single();
    if (!aErr && act) {
      await supabase.from('action_item_events').insert({ item_id: act.id, actor_id: user.id, action: 'Created', note: `From the QA portal: ${type.title}` });
      actionMsg = ' An improvement action was opened.';
      revalidatePath('/qa/actions'); revalidatePath('/action-items');
    } else actionMsg = ' (The improvement action could not be opened: ' + (aErr?.message ?? 'unknown error') + ')';
  }

  revalidatePath('/qa/records'); revalidatePath(`/qa/records/${type.key}`); revalidatePath('/qa/report');
  const done = type.key === 'quarterly' ? backPath : `/qa/records/${type.key}`;
  redirect(`${done}${done.includes('?') ? '&' : '?'}ok=${encodeURIComponent((id ? 'Saved.' : 'Record saved.') + actionMsg)}${type.key === 'quarterly' ? '#signoff' : ''}`);
}

export async function setQaRecordStatus(formData) {
  const { supabase, user } = await gate();
  const type = findQaRecordType(text(formData, 'type', 40));
  const status = text(formData, 'status');
  if (!type || !QA_RECORD_STATUSES.includes(status)) redirect('/qa/records');
  const { error } = await supabase.from('records').update({ status, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', text(formData, 'id', 40)).eq('division', QA_DIVISION);
  revalidatePath(`/qa/records/${type.key}`); revalidatePath('/qa/records');
  redirect(`/qa/records/${type.key}?${error ? 'error' : 'ok'}=${encodeURIComponent(error ? error.message : `Status set to ${status}.`)}`);
}
