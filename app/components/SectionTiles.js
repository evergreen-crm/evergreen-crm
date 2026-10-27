// 🔒 The menu sections as big tiles (computer and phone). Each tile says in plain words what the person can see.
import Link from 'next/link';

export default function SectionTiles({ sections = [] }) {
  return (
    <div className="sec-tiles">
      {sections.map((s) => (
        <Link key={s.key} href={`/s/${s.key}`} className="sec-tile">
          <span className="sec-icon" aria-hidden="true">{s.icon}</span>
          <strong>{s.label}</strong>
          <span className="sec-blurb">{s.blurb}</span>
          <span className="sec-you">🔒 {s.you}</span>
        </Link>
      ))}
    </div>
  );
}
