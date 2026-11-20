// Offline notes (plan B3): saves notes and records that were written on a device while the internet was down.
// Each item keeps the date and time it was written; offline_id makes a second upload of the same item harmless.
import { ENTRY_TYPES } from '@/lib/entries';
import { TZ } from '@/lib/options';

const SHIFTS = ['Day', 'Evening', 'Night'];
const UUID = /^[0-9a-f-]{36}$/i;
const localDate = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts));
const localTime = (ts) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
const val = (f, k) => { const v = f?.[k]; return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };

export async function syncItem(supabase, userId, item) {
  const f = item?.fields ?? {};
  if (!UUID.test(item?.id ?? '')) return { ok: false, error: 'Bad item' };
  const at = new Date(item.writtenAt);
  if (Number.isNaN(at.getTime()) || at > new Date(Date.now() + 5 * 60e3) || at < new Date(Date.now() - 14 * 86400e3)) {
    return { ok: false, error: 'The time this was written is not valid (more than 14 days ago, or in the future).' };
  }
  const writtenAt = at.toISOString();

  if (item.kind === 'note') {
    const rid = val(f, 'resident_id'); const note = val(f, 'note');
    if (!rid || !note) return { ok: false, error: 'The note was empty.' };
    const sign = f.sign === 'yes';
    const row = {
      shift: SHIFTS.includes(val(f, 'shift')) ? val(f, 'shift') : 'Day',
      mood: val(f, 'mood'), meals: val(f, 'meals'), activities: val(f, 'activities'), note,
      share_with_family: f.share_with_family === 'on',
      goal_ids: (val(f, 'goal_ids') ?? '').split(',').filter((x) => UUID.test(x)),
      signed_at: sign ? writtenAt : null,
      written_offline_at: writtenAt,
    };
    const draftId = val(f, 'note_id');
    if (draftId && UUID.test(draftId)) {
      const { data, error } = await supabase.from('shift_notes').update({ ...row, offline_id: item.id })
        .eq('id', draftId).eq('author_id', userId).is('signed_at', null).select('id');
      if (error) return dup(error) ? { ok: true } : { ok: false, error: error.message };
      if (data?.length) return { ok: true };
      // The draft was signed or removed meanwhile: save this as a new note instead.
    }
    const { error } = await supabase.from('shift_notes').insert({ ...row, resident_id: rid, author_id: userId, note_date: localDate(writtenAt), offline_id: item.id });
    if (error) return dup(error) ? { ok: true } : { ok: false, error: error.message };
    return { ok: true };
  }

  if (item.kind === 'entry') {
    const kind = val(f, 'kind'); const type = ENTRY_TYPES[kind];
    if (!type) return { ok: false, error: 'Unknown record type.' };
    const data = {};
    for (const fld of type.fields) {
      const v = val(f, fld.name);
      if (fld.required && v === null) return { ok: false, error: `"${fld.label}" was not filled in.` };
      if (v !== null) data[fld.name] = fld.type === 'number' ? Number(v) : v;
    }
    let amount = null;
    if (kind === 'money') {
      amount = Math.abs(Number(data.amount)) * (data.type?.startsWith('Money out') ? -1 : 1);
      if (!Number.isFinite(amount) || amount === 0) return { ok: false, error: 'No amount.' };
    }
    const { error } = await supabase.from('entries').insert({
      kind, home_id: val(f, 'home_id'),
      resident_id: type.scope === 'resident' ? val(f, 'resident_id') : null,
      entry_date: val(f, 'entry_date') ?? localDate(writtenAt),
      entry_time: val(f, 'entry_time') ?? localTime(writtenAt),
      data, amount,
      share_with_family: type.scope === 'resident' && f.share_with_family === 'on',
      created_by: userId, offline_id: item.id, written_offline_at: writtenAt,
    });
    if (error) return dup(error) ? { ok: true } : { ok: false, error: error.message };
    return { ok: true };
  }
  return { ok: false, error: 'Unknown item.' };
}

const dup = (e) => e?.code === '23505' && /offline_id/.test(e?.message ?? '');
