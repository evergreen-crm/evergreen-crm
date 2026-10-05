// Runs before every page: keeps the login session fresh and
// sends anyone who is not logged in to the login page.
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // /verify is public: anyone can scan a staff ID card's QR code.
  // /api/cron/ is called by Vercel's scheduler and checks its own secret.
  if (!user && !path.startsWith('/login') && !path.startsWith('/verify/') && !path.startsWith('/f/') && !path.startsWith('/api/cron/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|sw\\.js|manifest\\.webmanifest|offline\\.html|icons/|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)'],
};
