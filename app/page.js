// Home: staff/managers/admins start at the Portal; families see their family member.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

export default async function HomePage() {
  const { supabase, profile } = await requireUser();
  if (profile.role !== 'family') redirect('/portal');

  // Families get only a safe card of their own family member (supabase/family-safe-resident.sql).
  const { data: cards } = await supabase.rpc('family_residents');
  const residents = (cards ?? []).map((r) => ({ ...r, homes: { name: r.home_name } }));

  return (
    <main>
      <h1>Your family member</h1>
      {residents?.length === 0 && <p className="muted">Nothing to show yet.</p>}
      <ul className="list">
        {residents?.map((r) => (
          <li key={r.id}>
            <Link href={`/residents/${r.id}`}>
              <strong>{r.first_name} {r.last_name}</strong>
              <span className="muted">{r.homes?.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
