// ☰ More: everything that isn't on the home tiles, in plain groups, with 🔍 Find.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { buildMenu } from '@/lib/menu';
import FindBox from '@/app/components/FindBox';
import MenuTiles from '@/app/components/MenuTiles';

export const dynamic = 'force-dynamic';

export default async function More() {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const [{ data: onb }, { data: psRole }] = await Promise.all([
    supabase.from('onboardings').select('status').eq('profile_id', profile.id).maybeSingle(),
    supabase.rpc('prescreen_role'),
  ]);
  const menu = buildMenu(profile, { psRole, onboarding: onb && onb.status !== 'Complete' });
  return (
    <main className="hub">
      <h1>☰ More</h1>
      <FindBox items={menu.all} />
      <h2 className="more-h">My home tiles</h2>
      <MenuTiles tiles={menu.tiles} />
      {menu.more.map((g) => (
        <section key={g.title}>
          <h2 className="more-h">{g.title}</h2>
          <div className="more-chips">
            {g.items.map((it) => <Link key={it.href + it.label} href={it.href} className="more-chip"><span aria-hidden="true">{it.icon}</span> {it.label}</Link>)}
          </div>
        </section>
      ))}
    </main>
  );
}
