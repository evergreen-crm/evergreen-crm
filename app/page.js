// Home: staff/managers/admins start at the Dashboard; families see their family member.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

export default async function HomePage() {
  const { supabase, profile } = await requireUser();
  if (profile.role !== 'family') redirect('/dashboard');

  const { data: residents } = await supabase
    .from('residents').select('id, first_name, last_name, homes(name)').order('last_name');

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
