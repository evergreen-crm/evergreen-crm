// Runs before every page: keeps the login session fresh and
// sends anyone who is not logged in to the login page.
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request) {
  // Signing out: don't refresh the session here, or a fresh login cookie could be sent back with the sign-out.
  if (request.nextUrl.pathname.startsWith('/auth/signout')) return NextResponse.next({ request });
  // A sign-in link that lands on any page with ?code= (Supabase falls back to the Site URL) goes to the link handler.
  const linkCode = request.nextUrl.searchParams.get('code');
  if (linkCode && !request.nextUrl.pathname.startsWith('/auth/callback') && /^[0-9a-f-]{20,}$/i.test(linkCode)) {
    const to = request.nextUrl.clone();
    to.pathname = '/auth/callback';
    to.search = `?code=${encodeURIComponent(linkCode)}`;
    return NextResponse.redirect(to);
  }
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
  // /jobs (Careers) and /apply (an applicant's private link, opened with an email code) are public (plan B5).
  if (!user && !path.startsWith('/login') && !path.startsWith('/auth/callback') && !path.startsWith('/verify/') && !path.startsWith('/f/') && !path.startsWith('/api/cron/')
      && path !== '/jobs' && !path.startsWith('/jobs/') && !path.startsWith('/apply/') && path !== '/api/apply-upload') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|sw\\.js|manifest\\.webmanifest|offline\\.html|icons/|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)'],
};
