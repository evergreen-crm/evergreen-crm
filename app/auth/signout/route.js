// Sign out: ends the session and removes every login cookie, so the next page always asks to sign in again.
// POST = the Sign out button. GET = the inactivity timer (?reason=idle).
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

async function signOut(request) {
  const reason = request.nextUrl.searchParams.get('reason') === 'idle' ? 'idle' : 'out';
  const response = NextResponse.redirect(new URL(`/login?signedout=${reason}`, request.url), { status: 303 });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* still clear the cookies below */ }
  // Belt and braces: delete every Supabase login cookie (including split .0/.1 cookies) even if signOut failed.
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith('sb-')) response.cookies.set(c.name, '', { path: '/', maxAge: 0 });
  }
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Clear-Site-Data', '"cookies"');
  return response;
}

export const POST = signOut;
export const GET = signOut;
