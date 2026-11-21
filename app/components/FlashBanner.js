'use client';
// Shows the message a form sent back with ?oops= (lib/fail.js), at the top of any page, until it is closed.
import { useEffect, useState } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';

export default function FlashBanner() {
  const sp = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const msg = sp.get('oops');
  const [shown, setShown] = useState(msg);
  useEffect(() => { setShown(msg); if (msg) window.scrollTo({ top: 0, behavior: 'smooth' }); }, [msg]);
  if (!shown) return null;
  const close = () => {
    setShown(null);
    const q = new URLSearchParams(sp.toString()); q.delete('oops');
    router.replace(path + (q.toString() ? '?' + q.toString() : '') + (typeof window !== 'undefined' ? window.location.hash : ''), { scroll: false });
  };
  return (
    <div role="alert" className="message error no-print" style={{ margin: '12px auto', maxWidth: 960, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ flex: 1 }}><strong>That wasn’t saved.</strong> {shown}</span>
      <button type="button" className="secondary small" onClick={close} aria-label="Close message">Close</button>
    </div>
  );
}
