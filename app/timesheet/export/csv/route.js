// Payroll export file (CSV). Logs each download.
import { getCurrentUser } from '@/lib/auth';
import { todayISO, addDaysISO } from '@/lib/options';
import { payrollCsv } from '@/lib/payroll';
import { loadPayroll, canExportPayroll } from '@/lib/payrollData';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { supabase, user, profile } = await getCurrentUser();
  if (!user || !profile?.active || !canExportPayroll(profile)) return new Response('Not allowed', { status: 403 });
  const p = new URL(request.url).searchParams.get('p');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(p ?? '') ? p : addDaysISO(todayISO(), -14);
  const data = await loadPayroll(supabase, day);
  const total = data.rows.reduce((a, r) => a + r.total, 0);
  await supabase.from('payroll_exports').insert({
    period_start: data.period.start, period_end: data.period.end, exported_by: user.id,
    people: data.rows.length, total_hours: Math.round(total * 100) / 100, not_approved: data.notApproved.length,
  });
  return new Response('﻿' + payrollCsv(data), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="evergreen-payroll-${data.period.start}-to-${data.period.end}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
