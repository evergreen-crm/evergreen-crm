// When a form can't be saved (a missing reason, a wrong date, a database refusal), send the person back to the
// page they were on with the message in a red banner. Throwing an Error instead shows only "Sorry — that didn't
// work" on the live site, because Next.js hides server error messages in production (Nov 21 youth worker test).
import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function fail(message) {
  const text = String(message ?? 'That could not be saved.').slice(0, 300);
  let back = '/';
  try {
    const h = await headers();
    const ref = h.get('referer');
    if (ref) {
      const u = new URL(ref);
      u.searchParams.delete('ok');
      u.searchParams.set('oops', text);
      back = u.pathname + u.search + u.hash;
    }
  } catch { /* keep "/" */ }
  if (back === '/') back = '/?oops=' + encodeURIComponent(text);
  redirect(back);
}
