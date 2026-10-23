'use server';
// Records who printed a documentation report (supabase/report-prints.sql).
import { requireUser } from '@/lib/auth';
import { levelOf, groupOf } from '@/lib/levels';

export async function logReportPrint(info) {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  if (lvl < 2 || (lvl === 2 && groupOf(profile))) return { error: 'Not allowed.' };
  const { error } = await supabase.from('report_prints').insert({
    report: 'daily-documentation', action: 'printed',
    home_id: info?.home_id || null, resident_id: info?.resident_id || null,
    date_from: info?.from || null, date_to: info?.to || null,
    sections: Array.isArray(info?.sections) ? info.sections.slice(0, 10) : null,
  });
  return error ? { error: error.message } : { ok: true };
}
