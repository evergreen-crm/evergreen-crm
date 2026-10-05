'use client';
// Android / Chrome / Edge: shows the real "Install" button. iPhone uses Share → Add to Home Screen.
import { useEffect, useState } from 'react';

export default function InstallButton() {
  const [evt, setEvt] = useState(null);
  const [state, setState] = useState('checking');
  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) { setState('installed'); return; }
    setState(/iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'other');
    const on = (e) => { e.preventDefault(); setEvt(e); setState('ready'); };
    window.addEventListener('beforeinstallprompt', on);
    window.addEventListener('appinstalled', () => setState('installed'));
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);

  if (state === 'installed') return <p className="message ok">✓ The Evergreen app is installed on this device.</p>;
  if (state === 'ready') return (
    <button className="big-install" onClick={async () => { evt.prompt(); const r = await evt.userChoice; if (r.outcome === 'accepted') setState('installed'); }}>
      📲 Install the Evergreen app
    </button>
  );
  if (state === 'ios') return <p className="message">On iPhone, follow the iPhone steps below (Safari → Share → Add to Home Screen).</p>;
  return null;
}
