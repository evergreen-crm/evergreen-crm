// Sign-in link landing (used by the TEST portal, whose database sends Supabase's standard sign-in link instead of
// Evergreen's 6-digit code email). Exchanges the one-time code in the link for a session, then opens the portal.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const supabase = await createClient();
  let error = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  else error = { message: 'missing code' };
  const to = new URL(error ? '/login?link=expired' : '/', url.origin);
  return NextResponse.redirect(to);
}
