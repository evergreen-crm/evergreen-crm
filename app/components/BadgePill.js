// A 🟢 / 🟡 / 🔴 performance badge pill.
import { BADGE } from '@/lib/badges';

export default function BadgePill({ color, big = false }) {
  const b = BADGE[color];
  if (!b) return <span className="muted small">No badge yet</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: b.bg, color: b.fg, border: `2px solid ${b.border}`,
      borderRadius: 999, padding: big ? '6px 16px' : '2px 10px', fontWeight: 700, fontSize: big ? 20 : 13, whiteSpace: 'nowrap' }}>
      {b.icon} {b.label}
    </span>
  );
}
