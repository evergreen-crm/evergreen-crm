'use client';
// Bottom tab bar on phones: Home · To-do · Inbox · More (the simple menu, Oct 2026).
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/portal', label: 'Home', icon: '🏠', match: (p) => p === '/portal' || p === '/' || p.startsWith('/go/') },
  { href: '/todo', label: 'To-do', icon: '✅' },
  { href: '/notifications', label: 'Inbox', icon: '🔔' },
  { href: '/more', label: 'More', icon: '☰' },
];

export default function MobileTabs({ unread = 0, todo = { total: 0, overdue: 0 } }) {
  const path = usePathname();
  return (
    <nav className="mtabs no-print" aria-label="App">
      {TABS.map((t) => {
        const on = t.match ? t.match(path) : path === t.href || path.startsWith(t.href + '/');
        return (
          <Link key={t.href} href={t.href} className={on ? 'on' : ''}>
            <span className="mt-icon">{t.icon}{t.href === '/notifications' && unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}{t.href === '/todo' && todo.total > 0 && <b className={todo.overdue ? '' : 'ok'}>{todo.total > 99 ? '99+' : todo.total}</b>}</span>
            <span className="mt-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
