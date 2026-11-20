// Online job application (plan B5): checks the applicant's private link + email-code session (server only).
import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';

export const sha = (s) => createHash('sha256').update(s).digest('hex');
export const cookieName = (token) => `evg_ja_${token.slice(0, 16)}`;
export const validToken = (t) => typeof t === 'string' && /^[0-9a-f]{64}$/i.test(t);

export async function sessionHashFor(token) {
  const v = (await cookies()).get(cookieName(token))?.value;
  return v ? sha(v) : null;
}

// The application, only when this browser has passed the email code.
export async function openApp(token) {
  if (!validToken(token) || !adminKey()) return null;
  const sess = await sessionHashFor(token);
  if (!sess) return null;
  const admin = createAdminClient();
  const { data } = await admin.from('job_applications').select('*, posting:posting_id(*)').eq('token', token).maybeSingle();
  if (!data || data.session_hash !== sess) return null;
  return { admin, app: data };
}

