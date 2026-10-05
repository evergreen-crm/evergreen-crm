import './globals.css';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import PrintButton from '@/app/PrintButton';
import NavMenu from '@/app/components/NavMenu';
import MobileTabs from '@/app/components/MobileTabs';
import PwaRegister from '@/app/components/PwaRegister';

export const metadata = {
  title: 'Evergreen Community Care',
  description: 'Supporting Growth. Building Futures.',
  applicationName: 'Evergreen',
  appleWebApp: { capable: true, title: 'Evergreen', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};
export const viewport = { themeColor: '#0b5a34', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }) {
  const { supabase, profile } = await getCurrentUser();
  let onb = null, unread = 0, toSign = 0;
  if (profile) {
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('profile_id', profile.id).is('read_at', null);
    unread = count ?? 0;
  }
  if (profile && profile.role !== 'family') {
    ({ data: onb } = await supabase.from('onboardings').select('status').eq('profile_id', profile.id).maybeSingle());
  }

  return (
    <html lang="en">
      <body>
        {profile && (
          <header className="topbar no-print">
            <Link href="/" className="brand"><img src="/logo-mark.png" alt="" /><span>EVERGREEN<small>COMMUNITY CARE</small></span></Link>
            {(() => {
              const isMgr = ['admin', 'manager'].includes(profile.role);
              const staffLike = profile.role !== 'family';
              const groups = profile.role === 'family'
                ? [{ title: 'Family', items: [{ href: '/', label: 'My family member', icon: '👪', color: '#0b5a34' }, { href: '/notifications', label: 'Notifications', icon: '🔔', color: '#b3261e', badge: unread || null }] }]
                : [
                  { title: 'Daily work', items: [
                    { href: '/portal', label: 'Portal', icon: '🏛', color: '#0f3059' },
                    { href: '/dashboard', label: 'Dashboard', icon: '📊', color: '#0b5a34' },
                    { href: '/homes', label: 'Houses', icon: '🏡', color: '#2e8b57' },
                    { href: '/calendar', label: 'Calendar', icon: '📅', color: '#1f6fb2' },
                    { href: '/schedule', label: 'Schedule', icon: '🗓', color: '#5a3d8a' },
                    { href: '/timesheet', label: 'Timesheet', icon: '⏱', color: '#8a5a00' },
                  ] },
                  { title: 'Me', items: [
                    { href: '/id', label: 'My ID card', icon: '🪪', color: '#0b5a34' },
                    ...(onb && onb.status !== 'Complete' ? [{ href: '/onboarding', label: 'My onboarding', icon: '✅', color: '#d4a72c', alert: true }] : []),
                    ...(profile.role === 'staff' ? [{ href: `/hr/${profile.id}`, label: 'My HR', icon: '📁', color: '#5a3d8a' }] : []),
                    { href: '/academy', label: 'Evergreen Academy', icon: '🎓', color: '#1f6fb2' },
                    { href: '/policies', label: 'Policies', icon: '📘', color: '#0f3059' },
                    { href: '/notifications', label: 'Notifications', icon: '🔔', color: '#b3261e', badge: unread || null },
                    { href: '/install', label: 'Install app', icon: '📲', color: '#0b5a34' },
                  ] },
                  ...(isMgr ? [{ title: 'Manage', items: [
                    { href: '/hr', label: 'HR & staff', icon: '👥', color: '#5a3d8a' },
                    { href: '/checkins', label: 'Check-ins', icon: '📍', color: '#b3261e' },
                    ...(profile.role === 'admin' ? [{ href: '/admin', label: 'Admin', icon: '⚙️', color: '#3d4a44' }] : []),
                  ] }] : []),
                ];
              return (
                <nav>
                  <NavMenu groups={groups} />
                  {staffLike && <Link href="/id" className="navquick">🪪 <span>My ID</span></Link>}
                  {onb && onb.status !== 'Complete' && <Link href="/onboarding" className="nav-alert">My onboarding</Link>}
                  <Link href="/notifications" className="bell" title="Notifications">🔔{unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}</Link>
                  <span className="muted who">{profile.full_name} · {profile.role}</span>
                  <PrintButton />
                  <form action="/auth/signout" method="post">
                    <button className="link">Sign out</button>
                  </form>
                </nav>
              );
            })()}
          </header>
        )}
        <div className="print-only print-head"><img src="/logo.png" alt="Evergreen Community Care" className="print-logo" /></div>
        <div className={`page${profile && profile.role !== 'family' ? ' has-tabs' : ''}`}>{children}</div>
        {profile && profile.role !== 'family' && <MobileTabs unread={unread} />}
        <PwaRegister />
      </body>
    </html>
  );
}
