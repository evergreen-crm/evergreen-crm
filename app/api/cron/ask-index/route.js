// 🤖 Ask Evergreen: read in new or changed policies. The database (supabase/ask-evergreen.sql, pg_cron + pg_net)
// calls this every 10 minutes, but only when a policy still needs reading in. Same Vault key check as /api/cron/urgent.
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { indexPolicies } from '@/lib/ask';

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
  const r = await indexPolicies({ budgetMs: 40000 });
  if (r.error) return Response.json({ ok: false, error: r.error }, { status: 500 });
  return Response.json({ ok: true, done: r.done, left: r.left, help: r.help, failed: r.failed.length });
}

export const POST = run;
export const GET = run;
