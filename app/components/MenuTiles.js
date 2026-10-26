// Home tiles for the person's role (lib/menu.js). Max 8, two across on a phone.
import Link from 'next/link';

export default function MenuTiles({ tiles = [] }) {
  return (
    <div className="mtiles">
      {tiles.map((t) => (
        <Link key={t.key} href={t.href} className={`mtile${t.tone === 'red' ? ' red' : ''}`}>
          <span className="mtile-icon" aria-hidden="true">{t.icon}</span>
          <strong>{t.label}</strong>
          <span className="mtile-sub">{t.sub}</span>
          {t.badge ? <span className="mtile-badge">{t.badge}</span> : null}
        </Link>
      ))}
    </div>
  );
}
