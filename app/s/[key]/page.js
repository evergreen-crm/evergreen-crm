// One menu section: its tasks as big tiles, with who can see it (Admin → 🔒 Security settings).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { loadMySections } from '@/lib/mySections';

export const dynamic = 'force-dynamic';

export default async function SectionPage({ params }) {
  const { key } = await params;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const [{ data: psRole }, { data: onb }] = await Promise.all([
    supabase.rpc('prescreen_role'),
    supabase.from('onboardings').select('status').eq('profile_id', profile.id).maybeSingle(),
  ]);
  const sections = await loadMySections(supabase, profile, { psRole, onboarding: onb && onb.status !== 'Complete' });
  const s = sections.find((x) => x.key === key);
  if (!s) redirect('/more?error=' + encodeURIComponent('That section isn’t open for you. Ask the administrator if you need it.'));
  return (
    <main>
      <p className="small no-print"><Link href="/more">← All sections</Link></p>
      <h1>{s.icon} {s.label}</h1>
      <p className="muted">{s.blurb}</p>
      <p className="sec-lock">🔒 <span><strong>Who can see this:</strong> {s.who} <strong>You:</strong> {s.you}</span></p>
      <div className="sec-tiles">
        {s.tiles.map((t) => (
          <Link key={t.href + t.label} href={t.href} className="sec-tile task">
            <span className="sec-icon" aria-hidden="true">{t.icon}</span>
            <strong>{t.label}</strong>
            <span className="sec-blurb">{t.sub}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
