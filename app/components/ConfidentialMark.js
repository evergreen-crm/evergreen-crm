// Wraps something confidential shown on screen (a policy) and lays the reader's name and the date across it,
// so a photo of the screen shows who took it. The mark can't be clicked and doesn't block reading or signing.
import { todayISO } from '@/lib/options';

const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

export default function ConfidentialMark({ name, children }) {
  const text = xml(`CONFIDENTIAL · Evergreen Community Care · ${name || 'Staff'} · ${todayISO()}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="300"><text x="20" y="262" transform="rotate(-20 20 262)" textLength="640" lengthAdjust="spacingAndGlyphs" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#b3261e" fill-opacity="0.2">${text}</text></svg>`;
  return (
    <div style={{ position: 'relative' }}>
      {children}
      <div aria-hidden="true" className="no-print" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundRepeat: 'repeat' }} />
    </div>
  );
}
