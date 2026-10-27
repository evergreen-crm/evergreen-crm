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
import SuggestButton from '@/app/components/SuggestButton';
import AskSide from '@/app/components/AskSide';
import { getMyTodos, todoCount } from '@/lib/todos';
import { personLabel } from '@/lib/levels';
import { buildMenu } from '@/lib/menu';
import { loadMySections, sectionFindItems } from '@/lib/mySections';

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

  const sections = profile && profile.role !== 'family'
    ? await loadMySections(supabase, profile, { psRole, onboarding: onb && onb.status !== 'Complete' }).catch(() => [])
    : [];

  return (
    <html lang="en">
      <body>
        {profile && (
          <header className="topbar no-print">
            <Link href="/" className="brand"><img src="/logo-mark.png" alt="" /><span>EVERGREEN<small>COMMUNITY CARE</small></span></Link>
            {(() => {
              const staffLike = profile.role !== 'family';
              // The simple menu (lib/menu.js): my home tiles first, then More. 🔍 Find searches every page I can open.
              const menu = staffLike ? buildMenu(profile, { onCall: sosHome?.on_call_phone ?? null, psRole, onboarding: onb && onb.status !== 'Complete' }) : null;
              const groups = profile.role === 'family'
                ? [{ title: 'Family', items: [{ href: '/', label: 'My family member', icon: '👪', color: '#0b5a34' }, { href: '/notifications', label: 'Alerts', icon: '🔔', color: '#b3261e', badge: unread || null }] }]
                : [
                  { title: 'Home', items: [
                    { href: '/portal', label: 'Home', icon: '🏠', color: '#0f3059' },
                    ...menu.tiles.map((t) => ({ href: t.href, label: t.label, icon: t.icon, color: t.tone === 'red' ? '#b3261e' : '#0b5a34', badge: t.badge })),
                  ] },
                  // 🔒 The sections this person may open (Admin → Security settings).
                  { title: 'Sections', items: sections.map((x) => ({ href: `/s/${x.key}`, label: x.label, icon: x.icon, color: '#0f3059' })) },
                  { title: 'Me & help', items: [
                    { href: '/todo', label: 'My to-do', icon: '✅', color: '#0f3059', badge: todo.total || null, alert: todo.overdue > 0 },
                    { href: '/notifications', label: 'Alerts', icon: '🔔', color: '#0f3059', badge: unread || null },
                    ...(onb && onb.status !== 'Complete' ? [{ href: '/onboarding', label: 'My onboarding', icon: '✅', color: '#d4a72c', alert: true }] : []),
                    { href: '/more', label: 'All sections', icon: '☰', color: '#0f3059' },
                    { href: '/ask', label: 'Ask Evergreen', icon: '🤖', color: '#0f3059' },
                    { href: '/help', label: 'Help', icon: '❓', color: '#0f3059' },
                  ] },
                ];
              return (
                <nav>
                  <NavMenu groups={groups} find={menu ? [...sectionFindItems(sections), ...menu.all] : null} />
                  {staffLike && <Link href="/todo" className={`navquick todo-count${todo.overdue ? ' late' : ''}`} title={todo.overdue ? `${todo.overdue} overdue` : 'My to-do'}>✅ <b>{todo.total}</b><span> To-do</span></Link>}
                  {staffLike && <Link href="/id" className="navquick">🪪 <span>My ID</span></Link>}
                  {onb && onb.status !== 'Complete' && <Link href="/onboarding" className="nav-alert">My onboarding</Link>}
                  {staffLike && <Link href="/ask" className="help-btn" title="Ask Evergreen — policy and how-to questions">🤖<span> Ask</span></Link>}
                  {staffLike && <SuggestButton />}
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
        {profile && profile.role !== 'family' && <MobileTabs unread={unread} todo={todo} />}
        {profile && profile.role !== 'family' && <AskSide onCall={sosHome?.on_call_phone ?? null} />}
        {profile && profile.role !== 'family' && <EmergencyButton onCall={sosHome?.on_call_phone ?? null} housePhone={sosHome?.phone ?? null} homeName={sosHome?.name ?? null} homeId={sosHome?.id ?? null} />}
        {profile && <IdleLogout />}
        <Suspense fallback={null}><PhoneHelpers /></Suspense>
        <PwaRegister />
        <DatePickerOpener />
      </body>
    </html>
  );
}
