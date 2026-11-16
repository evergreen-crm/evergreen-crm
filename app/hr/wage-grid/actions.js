'use server';
// Wage grid: one grid per effective date (grid level x step). Changed only by the Executive Director, CSO, CEO and
// Administrator (checked again by save_wage_grid in the database). Saving sends any offer letters waiting for a rate.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { emailOfferLink } from '@/lib/offerEmail';

const go = (msg, bad) => redirect(`/hr/wage-grid?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function save(supabase, effective, rows) {
  const { data, error } = await supabase.rpc('save_wage_grid', { p_effective: effective, p_rows: rows });
  if (error) go(error.message, true);
  for (const id of data?.sent ?? []) await emailOfferLink(id);
  revalidatePath('/hr/wage-grid'); revalidatePath('/hr/pay-rates');
  return data;
}

// Edit every rate of one grid (inputs named r_<level>_<step>).
export async function saveGrid(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const effective = String(fd.get('effective') ?? '');
  if (!DATE.test(effective)) go('Choose the date this grid starts.', true);
  const rows = [];
  for (const [k, v] of fd.entries()) {
    const m = /^r_(\d+)_(\d+)$/.exec(k);
    if (!m || String(v).trim() === '') continue;
    const rate = Number(v);
    if (!(rate > 0 && rate < 500)) go(`Grid ${m[1]}, step ${m[2]}: enter a rate between $1 and $500.`, true);
    rows.push({ level: Number(m[1]), step: Number(m[2]), rate });
  }
  const d = await save(supabase, effective, rows);
  go(`Saved the grid starting ${effective} (${d?.rates ?? rows.length} rates).${d?.sent?.length ? ` ${d.sent.length} waiting offer letter(s) sent.` : ''}`);
}

// A new year's grid: copy the grid in force on the new date and raise every rate by a percentage.
export async function raiseGrid(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const effective = String(fd.get('effective') ?? '');
  const pct = Number(fd.get('pct'));
  if (!DATE.test(effective)) go('Choose the date the new grid starts.', true);
  if (!(pct > -20 && pct < 50)) go('Enter the increase as a percentage, for example 3.', true);
  const { data: dates } = await supabase.from('wage_grid').select('effective_date').lt('effective_date', effective).order('effective_date', { ascending: false }).limit(1);
  const base = dates?.[0]?.effective_date;
  if (!base) go('There is no earlier grid to copy. Enter the rates instead.', true);
  const { data: cur } = await supabase.from('wage_grid').select('grid_level, step, hourly_rate').eq('effective_date', base);
  const rows = (cur ?? []).map((r) => ({ level: r.grid_level, step: r.step, rate: Math.round(Number(r.hourly_rate) * (1 + pct / 100) * 100) / 100 }));
  const d = await save(supabase, effective, rows);
  go(`Made the grid starting ${effective}: the ${base} grid plus ${pct}% (${d?.rates ?? rows.length} rates). Check each rate against the published grid.`);
}
