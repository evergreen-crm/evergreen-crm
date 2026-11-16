'use server';
// Wage grid: one grid per effective date (grid level x step). Payroll enters a new or changed grid; a director at
// level 4 to 8 approves it on the Pay rates page (checked by request_pay_change / decide_pay_change in the database).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const go = (msg, bad) => redirect(`/hr/wage-grid?${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// A grid change is a request: Payroll enters it, a director at level 4 to 8 approves it on the Pay rates page.
async function save(supabase, effective, rows, note) {
  const { error } = await supabase.rpc('request_pay_change', { p: { kind: 'grid', grid_effective: effective, grid_rows: rows, note } });
  if (error) go(error.message, true);
  revalidatePath('/hr/wage-grid'); revalidatePath('/hr/pay-rates');
  return { rates: rows.length };
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
  await save(supabase, effective, rows, `Grid starting ${effective} (entered by hand)`);
  go(`Sent for approval: the grid starting ${effective} (${rows.length} rates). A director at level 4 to 8 approves it on the Pay rates page.`);
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
  await save(supabase, effective, rows, `The ${base} grid plus ${pct}%`);
  go(`Sent for approval: the grid starting ${effective} (the ${base} grid plus ${pct}%). Check each rate against the published grid before it is approved.`);
}
