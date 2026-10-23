import './globals.css';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import PrintButton from '@/app/PrintButton';
import NavMenu from '@/app/components/NavMenu';
import MobileTabs from '@/app/components/MobileTabs';
import EmergencyButton from '@/app/components/EmergencyButton';
import PwaRegister from '@/app/components/PwaRegister';
import DatePickerOpener from '@/app/components/DatePickerOpener';
import IdleLogout from '@/app/components/IdleLogout';
import PhoneHelpers from '@/app/components/PhoneHelpers';
import { Suspense } from 'react';
import { after } from 'next/server';
import { maybeFlushUrgent } from '@/lib/emailOutbox';
import HelpButton from '@/app/components/HelpButton';
import { getMyTodos, todoCount } from '@/lib/todos';
import { levelOf, groupOf, personLabel, canHR, canPayroll } from '@/lib/levels';

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
    after(() => maybeFlushUrgent()); // Step 7: urgent alert emails, at most once a minute
  }
  let psRole = null;
  let todo = { total: 0, overdue: 0 };
  let sosHome = null;
  if (profile && profile.role !== 'family') {
    ({ data: onb } = await supabase.from('onboardings').select('status').eq('profile_id', profile.id).maybeSingle());
    ({ data: psRole } = await supabase.rpc('prescreen_role'));
    try { todo = todoCount(await getMyTodos(supabase, profile)); } catch {}
    // The house for the 🆘 button: where I'm clocked in now, or my own house.
    try {
      const { data: te } = await supabase.from('time_entries').select('home_id').eq('profile_id', profile.id).is('clock_out', null).maybeSingle();
      const hid = te?.home_id ?? profile.home_id;
      if (hid) {
        let r = await supabase.from('homes').select('id, name, phone, on_call_phone').eq('id', hid).maybeSingle();
        if (r.error) r = await supabase.from('homes').select('id, name, phone').eq('id', hid).maybeSingle();
        sosHome = r.data ?? null;
      }
    } catch {}
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
                ? [{ title: 'Family', items: [{ href: '/', label: 'My family member', icon: '👪', color: '#0b5a34' }, { href: '/notifications', label: 'Alerts', icon: '🔔', color: '#b3261e', badge: unread || null }] }]
                : [
                  { title: 'Daily work', items: [
                    { href: '/portal', label: 'Portal', icon: '🏛', color: '#0f3059' },
                    { href: '/dashboard', label: 'Overview', icon: '📊', color: '#0b5a34' },
                    { href: '/checklist', label: 'Shift checklist', icon: '📋', color: '#2e8b57' },
                    { href: '/notes', label: 'Daily notes', icon: '📝', color: '#1f6fb2' },
                    { href: '/action-items', label: 'Problems to fix', icon: '⚠️', color: '#b3261e' },
                    { href: '/missing', label: 'Missing youth', icon: '🔎', color: '#b3261e' },
                    ...(levelOf(profile) >= 2 ? [{ href: '/approvals', label: 'Approvals & 🆘', icon: '🙋', color: '#b3261e' }] : []),
                    ...(levelOf(profile) >= 2 ? [{ href: '/kpi', label: 'How we’re doing (KPIs)', icon: '📈', color: '#1f6fb2' }] : []),
                    { href: '/homes', label: 'Houses', icon: '🏡', color: '#2e8b57' },
                    { href: '/calendar', label: 'Calendar', icon: '📅', color: '#1f6fb2' },
                    { href: '/schedule', label: 'Schedule', icon: '🗓', color: '#5a3d8a' },
                    { href: '/timesheet', label: 'My hours', icon: '⏱', color: '#8a5a00' },
                  ] },
                  { title: 'Me', items: [
                    { href: '/todo', label: 'My to-do', icon: '✅', color: todo.overdue ? '#b3261e' : '#0b5a34', badge: todo.total || null, alert: todo.overdue > 0 },
                    { href: '/id', label: 'My ID card', icon: '🪪', color: '#0b5a34' },
                    ...(onb && onb.status !== 'Complete' ? [{ href: '/onboarding', label: 'My onboarding', icon: '✅', color: '#d4a72c', alert: true }] : []),
                    ...(profile.role === 'staff' && !canHR(profile) ? [{ href: `/hr/${profile.id}`, label: 'My HR', icon: '📁', color: '#5a3d8a' }] : []),
                    { href: '/academy', label: 'Evergreen Academy', icon: '🎓', color: '#1f6fb2' },
                    { href: '/careers', label: 'Career & perks', icon: '🌱', color: '#2e8b57' },
                    ...(levelOf(profile) < 2 && !canHR(profile) ? [{ href: '/probation', label: 'My first 90 days', icon: '📝', color: '#8a5a00' }] : []),
                    { href: '/policies', label: 'Policies', icon: '📘', color: '#0f3059' },
                    { href: '/notifications', label: 'Alerts', icon: '🔔', color: '#b3261e', badge: unread || null },
                    { href: '/words', label: 'What does this mean?', icon: '📖', color: '#0f3059' },
                    { href: '/help', label: levelOf(profile) >= 2 ? 'Help & questions' : 'Help', icon: '❓', color: '#0f3059' },
                    { href: '/install', label: 'Install app', icon: '📲', color: '#0b5a34' },
                  ] },
                  ...(isMgr || psRole || canHR(profile) || canPayroll(profile) || levelOf(profile) >= 2 ? [{ title: 'Manage', items: [
                    ...(isMgr ? [{ href: '/intake', label: 'New referrals', icon: '📨', color: '#1f6fb2' }] : []),
                    ...(isMgr ? [{ href: '/launch', label: 'Opening a new house', icon: '🚀', color: '#0f3059' }] : []),
                    ...(levelOf(profile) >= 2 || canHR(profile) ? [{ href: '/probation', label: 'First-90-days reviews', icon: '📝', color: '#8a5a00' }] : []),
                    ...(canHR(profile) ? [{ href: '/hr', label: 'HR & staff', icon: '👥', color: '#5a3d8a' }] : []),
                    ...(levelOf(profile) >= 2 || canHR(profile) ? [{ href: '/records', label: 'Missing details', icon: '🧩', color: '#5a3d8a' }] : []),
                    ...(levelOf(profile) >= 3 || (levelOf(profile) === 2 && !groupOf(profile)) ? [{ href: '/reports/daily', label: 'Print documentation', icon: '🖨', color: '#0f3059' }] : []),
                    ...(canPayroll(profile) && !isMgr ? [{ href: '/timesheet', label: 'Payroll — staff hours', icon: '💵', color: '#8a5a00' }] : []),
                    ...(psRole ? [{ href: '/hr/prescreen', label: 'Job applicants', icon: '🧾', color: '#0b5a34' }] : []),
                    ...(isMgr ? [{ href: '/checkins', label: 'Staff on shift', icon: '📍', color: '#b3261e' }] : []),
                    ...(profile.role === 'admin' ? [{ href: '/admin', label: 'Admin', icon: '⚙️', color: '#3d4a44' }] : []),
                  ] }] : []),
                ];
              return (
                <nav>
                  <NavMenu groups={groups} />
                  {staffLike && <Link href="/todo" className={`navquick todo-count${todo.overdue ? ' late' : ''}`} title={todo.overdue ? `${todo.overdue} overdue` : 'My to-do'}>✅ <b>{todo.total}</b><span> To-do</span></Link>}
                  {staffLike && <Link href="/id" className="navquick">🪪 <span>My ID</span></Link>}
                  {onb && onb.status !== 'Complete' && <Link href="/onboarding" className="nav-alert">My onboarding</Link>}
                  {staffLike && <HelpButton />}
                  <Link href="/notifications" className="bell" title="Alerts">🔔{unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}</Link>
                  <span className="muted who">{profile.full_name} · {personLabel(profile)}</span>
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
        {profile && profile.role !== 'family' && <MobileTabs unread={unread} todo={todo} frontline={levelOf(profile) <= 2 && !!profile.home_id && !groupOf(profile)} />}
        {profile && profile.role !== 'family' && <EmergencyButton onCall={sosHome?.on_call_phone ?? null} housePhone={sosHome?.phone ?? null} homeName={sosHome?.name ?? null} homeId={sosHome?.id ?? null} />}
        {profile && <IdleLogout />}
        <Suspense fallback={null}><PhoneHelpers /></Suspense>
        <PwaRegister />
        <DatePickerOpener />
      </body>
    </html>
  );
}
