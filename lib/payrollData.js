// Loads everything the payroll export needs for one pay period (plan B2). Database rules decide what's visible.
import { addDaysISO, payPeriod } from '@/lib/options';
import { buildPayroll, localDate } from '@/lib/payroll';
import { levelOf } from '@/lib/levels';

export const canExportPayroll = (p) => p?.role === 'admin' || p?.staff_group === 'payroll' || (levelOf(p) >= 6 && !p?.staff_group);

export async function loadPayroll(supabase, anyDay) {
  const period = payPeriod(anyDay);
  const from = addDaysISO(period.start, -32), to = addDaysISO(period.end, 2);
  const [{ data: entries }, { data: absences }, { data: timeOff }, { data: profiles }, { data: details }, { data: exports }] = await Promise.all([
    supabase.from('time_entries').select('id, profile_id, clock_in, clock_out, break_minutes, approved_at, home_id')
      .gte('clock_in', from).lte('clock_in', to).limit(20000),
    supabase.from('shift_absences').select('profile_id, shift_date, pay_type, hours, kind, status')
      .gte('shift_date', period.start).lte('shift_date', period.end),
    supabase.from('time_off_requests').select('profile_id, start_date, end_date, kind, status')
      .eq('status', 'Approved').lte('start_date', period.end).gte('end_date', period.start),
    supabase.from('profiles').select('id, full_name'),
    supabase.from('staff_details').select('profile_id, employee_no, position, program, hours_per_week, employment_type'),
    supabase.from('payroll_exports').select('exported_at, people, total_hours, not_approved, by:exported_by(full_name)')
      .eq('period_start', period.start).order('exported_at', { ascending: false }),
  ]);
  const det = new Map((details ?? []).map((d) => [d.profile_id, d]));
  const people = (profiles ?? []).map((p) => ({ id: p.id, full_name: p.full_name, ...(det.get(p.id) ?? {}) }));
  const all = entries ?? [];
  const inPeriod = (e) => { const d = localDate(e.clock_in); return d >= period.start && d <= period.end; };
  const approved = all.filter((e) => e.clock_out && e.approved_at);
  const notApproved = all.filter((e) => inPeriod(e) && !e.approved_at);
  const { rows, stats } = buildPayroll({ period, entries: approved, absences: absences ?? [], timeOff: timeOff ?? [], people });
  const name = new Map(people.map((p) => [p.id, p.full_name]));
  const lastExport = exports?.[0] ?? null;
  const changedSince = lastExport ? approved.filter((e) => inPeriod(e) && e.approved_at > lastExport.exported_at).length : 0;
  return {
    period, rows, stats, exports: exports ?? [], lastExport, changedSince,
    notApproved: notApproved.map((e) => ({ ...e, full_name: name.get(e.profile_id) ?? '—', open: !e.clock_out })),
  };
}
