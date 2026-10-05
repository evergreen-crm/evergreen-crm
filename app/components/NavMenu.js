'use client';
// The ☰ Menu button: opens a grid of tiles. Closes when you pick a page, press Esc or click outside.
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavMenu({ groups }) {
  const ref = useRef(null);
  const path = usePathname();
  useEffect(() => { if (ref.current) ref.current.open = false; }, [path]);
  useEffect(() => {
    const close = (e) => { if (ref.current?.open && (e.key === 'Escape' || (e.type === 'mousedown' && !ref.current.contains(e.target)))) ref.current.open = false; };
    document.addEventListener('keydown', close);
    document.addEventListener('mousedown', close);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('mousedown', close); };
  }, []);

  return (
    <details className="navmenu" ref={ref}>
      <summary aria-label="Open menu"><span className="nm-icon">☰</span><span>Menu</span></summary>
      <div className="nm-panel">
        {groups.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <div className="nm-grid">
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className={`nm-tile${path === it.href || (it.href !== '/' && path.startsWith(it.href + '/')) ? ' on' : ''}${it.alert ? ' alert' : ''}`}
                  style={{ '--tile': it.color }}>
                  <span className="nm-emoji">{it.icon}</span>
                  <span className="nm-label">{it.label}</span>
                  {it.badge ? <span className="nm-badge">{it.badge}</span> : null}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}
