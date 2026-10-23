'use server';
// Records who printed a report (supabase/report-prints.sql).
// daily-documentation: Program Coordinator (own house) and up — not HR or Payroll.
// staff-file: HR, and Program Manager and up.
import { requireUser } from '@/lib/auth';
import { levelOf, groupOf, canHR } from '@/lib/levels';

export async function logReportPrint(info) {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  const report = info?.report === 'staff-file' ? 'staff-file' : 'daily-documentation';
  const allowed = report === 'staff-file' ? canHR(profile) : lvl >= 3 || (lvl === 2 && !groupOf(profile));
  if (!allowed) return { error: 'Not allowed.' };
  const row = {
    report, action: 'printed',
    home_id: info?.home_id || null, resident_id: info?.resident_id || null,
    date_from: info?.from || null, date_to: info?.to || null,
    sections: Array.isArray(info?.sections) ? info.sections.slice(0, 20) : null,
  };
  if (report === 'staff-file') row.staff_id = info?.staff_id || null;
  const { error } = await supabase.from('report_prints').insert(row);
  return error ? { error: error.message } : { ok: true };
}
