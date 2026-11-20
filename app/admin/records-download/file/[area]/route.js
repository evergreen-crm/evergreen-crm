// Monthly records download (plan E4): one Excel workbook for one area. Administrator only; each download is logged.
import { getCurrentUser } from '@/lib/auth';
import { buildArea, AREAS } from '@/lib/recordsExport';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request, { params }) {
  const { area } = await params;
  const { supabase, user, profile } = await getCurrentUser();
  if (!user || !profile?.active || profile.role !== 'admin') return new Response('Not allowed', { status: 403 });
  if (!AREAS.some((a) => a.key === area)) return new Response('Not found', { status: 404 });
  let out;
  try { out = await buildArea(area); } catch (e) { return new Response('Could not build the file: ' + (e?.message ?? e), { status: 500 }); }
  await supabase.from('records_exports').insert({ area, tables: out.tables, rows_total: out.rows, exported_by: user.id });
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Etc/GMT+7' }).format(new Date());
  return new Response(out.buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="evergreen-records-${area}-${day}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
