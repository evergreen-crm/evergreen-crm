'use server';
// Save the daily grid: one row per child, the day book and daily checks entered together for a date.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { ENTRY_TYPES } from '@/lib/entries';
import { dailyKindsFor } from '@/lib/dailyGrid';
import { nowTime } from '@/lib/options';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveDailyGrid(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const homeId = String(formData.get('home_id') ?? '');
  const date = String(formData.get('entry_date') ?? '');
  const program = String(formData.get('program') ?? '');
  if (!DATE.test(date) || !homeId) throw new Error('Choose a date and a house.');
  const kinds = dailyKindsFor(program);
  const time = nowTime();

  // Collect answers per child and kind: name looks like g|<resident>|<kind>|<field>.
  const rows = {};
  for (const [key, value] of formData.entries()) {
    const [tag, resident, kind, field] = String(key).split('|');
    if (tag !== 'g' || !kinds.includes(kind) || typeof value !== 'string' || value.trim() === '') continue;
    ((rows[resident] ??= {})[kind] ??= {})[field] = value.trim();
  }

  const inserts = [];
  const skipped = [];
  for (const [resident, byKind] of Object.entries(rows)) {
    for (const [kind, data] of Object.entries(byKind)) {
      const type = ENTRY_TYPES[kind];
      const missing = type.fields.filter((f) => f.required && !data[f.name]).map((f) => f.label);
      if (missing.length) { skipped.push(`${type.label}: needs “${missing[0]}”`); continue; }
      inserts.push({ kind, home_id: homeId, resident_id: resident, entry_date: date, entry_time: time, data, share_with_family: false, created_by: user.id });
    }
  }
  if (inserts.length) {
    const { error } = await supabase.from('entries').insert(inserts);
    if (error) throw new Error('Could not save: ' + error.message);
  }
  revalidatePath(`/homes/${homeId}`);
  const q = new URLSearchParams({ tab: 'daily', date, saved: String(inserts.length), skipped: skipped.slice(0, 3).join('; ') });
  redirect(`/homes/${homeId}/daily?${q}`);
}
