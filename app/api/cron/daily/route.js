// Called by Vercel Cron every morning (see vercel.json). Vercel sends
// "Authorization: Bearer <CRON_SECRET>"; anyone else gets "Not allowed".
import { runDailyJob } from '@/lib/automation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Not allowed' }, { status: 401 });
  }
  const r = await runDailyJob({ trigger: 'cron' });
  if (r.error) return Response.json({ ok: false, error: r.error }, { status: 500 });
  return Response.json({ ok: true, summary: r.summary });
}
