// Urgent alert emails, sent within about 2 minutes, day or night.
// The database (supabase/attendance.sql, pg_cron + pg_net) calls this every 2 minutes, but only when an urgent
// alert is waiting. It sends a key that is kept in the Supabase Vault; the key is checked by the database, so
// nothing secret lives in the code. Vercel Cron's CRON_SECRET also works.
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { flushOutbox } from '@/lib/emailOutbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function allowed(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return true;
  const key = request.headers.get('x-flush-key');
  if (!key || key.length < 32 || !adminKey()) return false;
  const { data } = await createAdminClient().rpc('urgent_flush_key_ok', { p_key: key });
  return data === true;
}

async function run(request) {
  if (!(await allowed(request))) return Response.json({ error: 'Not allowed' }, { status: 401 });
  const r = await flushOutbox('urgent');
  return Response.json({ ok: true, sent: r.sent ?? 0, errors: (r.errors ?? []).length });
}

export const POST = run;
export const GET = run;
