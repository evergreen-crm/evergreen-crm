// ADMIN connection with the secret service key. It skips all access rules,
// so it is ONLY used on the server, and only after checking the user is an admin.
import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Prefer the key added by the Supabase–Vercel connection; fall back to the older service_role key.
export function adminKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    adminKey(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
