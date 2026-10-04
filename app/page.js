// Home page: the residents this person is allowed to see.
// The database rules do the filtering: staff see their home,
// family see only their own family member.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';

export default async function HomePage() {
  const { supabase, profile } = await requireUser();

  const { data: residents, error } = await supabase
    .from('residents')
    .select('id, first_name, last_name, status, homes(name)')
    .order('last_name');

  return (
    <main>
      <h1>{profile.role === 'family' ? 'Your family member' : 'Residents'}</h1>
      {error && <p className="message">{error.message}</p>}
      {residents?.length === 0 && <p className="muted">No residents to show yet.</p>}
      <ul className="list">
        {residents?.map((r) => (
          <li key={r.id}>
            <Link href={`/residents/${r.id}`}>
              <strong>{r.first_name} {r.last_name}</strong>
              <span className="muted">{r.homes?.name} · {r.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
