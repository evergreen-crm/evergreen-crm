import './globals.css';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import PrintButton from '@/app/PrintButton';

export const metadata = { title: 'Evergreen CRM' };

export default async function RootLayout({ children }) {
  const { profile } = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        {profile && (
          <header className="topbar no-print">
            <Link href="/" className="brand">Evergreen</Link>
            <nav>
              {profile.role === 'family'
                ? <Link href="/">My family member</Link>
                : <><Link href="/homes">Houses</Link><Link href="/calendar">Calendar</Link></>}
              {['admin', 'manager'].includes(profile.role) && <Link href="/hr">HR</Link>}
              {profile.role === 'staff' && <Link href={`/hr/${profile.id}`}>My HR</Link>}
              {profile.role === 'admin' && <Link href="/admin">Admin</Link>}
              <span className="muted">{profile.full_name} · {profile.role}</span>
              <PrintButton />
              <form action="/auth/signout" method="post">
                <button className="link">Sign out</button>
              </form>
            </nav>
          </header>
        )}
        <div className="page">{children}</div>
      </body>
    </html>
  );
}
