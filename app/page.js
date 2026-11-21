// Home: staff/managers/admins start at the Portal; families see their family member; social workers see their youth.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { fmtDate } from '@/lib/options';

export default async function HomePage() {
  const { supabase, profile } = await requireUser();
  if (profile.role !== 'family') redirect('/portal');

  // Families get only a safe card of their own family member (supabase/family-safe-resident.sql).
  // Social workers get the youth on their access list (supabase/social-worker-view.sql).
  const [{ data: cards }, { data: youth }] = await Promise.all([
    supabase.rpc('family_residents'),
    supabase.rpc('worker_my_youth'),
  ]);
  const residents = (cards ?? []).map((r) => ({ ...r, homes: { name: r.home_name } }));
  const mine = youth ?? [];

  return (
    <main>
      {mine.length > 0 && (
        <>
          <h1>Your youth at Evergreen</h1>
          <p className="muted small">Read-only view for {profile.full_name}. Every view is recorded. For anything urgent, phone the house.</p>
          <ul className="list">
            {mine.map((y) => (
              <li key={y.resident_id}>
                <Link href={`/worker/${y.resident_id}`}>
                  <strong>{y.preferred_name || y.name}</strong>{y.preferred_name ? <span className="muted"> ({y.name})</span> : null}
                  <span className="muted"> · {y.home_name} · you are their {y.worker_role.replace(/^Social/, 'social').replace(/^Guardianship/, 'guardianship').replace(/^Resource/, 'resource')} ({y.org}) · access until {fmtDate(y.expires_on)}</span>
                  {y.unread > 0 && <span className="badge"> {y.unread} new message{y.unread > 1 ? 's' : ''}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {(residents.length > 0 || mine.length === 0) && <h1>Your family member</h1>}
      {residents.length === 0 && mine.length === 0 && <p className="muted">Nothing to show yet. If you are a social worker and expected to see a youth, ask the house’s Program Coordinator to give you access.</p>}
      <ul className="list">
        {residents.map((r) => (
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
