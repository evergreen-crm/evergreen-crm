// ☰ All sections: the menu as big tiles (computer and phone), with 🔍 Find and Help.
// Which sections show comes from Admin → 🔒 Security settings (lib/sections.js, supabase/section-access.sql).
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { buildMenu } from '@/lib/menu';
import { loadMySections, sectionFindItems } from '@/lib/mySections';
import FindBox from '@/app/components/FindBox';
import SectionTiles from '@/app/components/SectionTiles';
import { levelOf } from '@/lib/levels';
import { plainError } from '@/lib/plain';

export const dynamic = 'force-dynamic';

export default async function More({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const [{ data: onb }, { data: psRole }] = await Promise.all([
    supabase.from('onboardings').select('status').eq('profile_id', profile.id).maybeSingle(),
    supabase.rpc('prescreen_role'),
  ]);
  const ctx = { psRole, onboarding: onb && onb.status !== 'Complete' };
  const menu = buildMenu(profile, ctx);
  const sections = await loadMySections(supabase, profile, ctx);
  return (
    <main>
      <h1>☰ All sections</h1>
      {sp.error && <p className="message">{plainError(sp.error)}</p>}
      <FindBox items={[...sectionFindItems(sections), ...menu.all]} />
      <SectionTiles sections={sections} />
      <h2 className="more-h">Help</h2>
      <div className="more-chips">
        <Link href="/ask" className="more-chip">🤖 Ask Evergreen</Link>
        <Link href="/help" className="more-chip">❓ {levelOf(profile) >= 2 ? 'Help & questions' : 'Help'}</Link>
        <Link href="/words" className="more-chip">📖 What does this word mean?</Link>
        <Link href="/install" className="more-chip">📲 Install the app</Link>
      </div>
    </main>
  );
}
