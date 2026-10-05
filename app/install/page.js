// How to put the Evergreen app on a phone's home screen.
import InstallButton from './InstallButton';

export const metadata = { title: 'Install the app · Evergreen' };

export default function InstallPage() {
  return (
    <main className="install">
      <div className="install-hero">
        <img src="/icons/icon-192.png" alt="" />
        <div>
          <h1>Get the Evergreen app</h1>
          <p className="muted">Your ID card, check-in, schedule and hours — one tap from your home screen. Free, no app store needed, and it updates by itself.</p>
        </div>
      </div>
      <InstallButton />

      <section className="card">
        <h2>📱 iPhone (Safari)</h2>
        <ol>
          <li>Open <strong>evergreen-crm-azure.vercel.app</strong> in <strong>Safari</strong> and sign in.</li>
          <li>Tap the <strong>Share</strong> button (square with an arrow ↑) at the bottom.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          <li>Open <strong>Evergreen</strong> from your home screen. It opens full-screen like an app.</li>
        </ol>
        <p className="muted small">Needs Safari. If you use Chrome on iPhone, tap the Share button in the address bar and choose Add to Home Screen.</p>
      </section>

      <section className="card">
        <h2>🤖 Android (Chrome)</h2>
        <ol>
          <li>Open <strong>evergreen-crm-azure.vercel.app</strong> in <strong>Chrome</strong> and sign in.</li>
          <li>Tap <strong>Install</strong> when it pops up — or tap the <strong>⋮</strong> menu → <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</li>
          <li>Open <strong>Evergreen</strong> from your home screen or app drawer.</li>
        </ol>
      </section>

      <section className="card">
        <h2>The first time you open it</h2>
        <ul>
          <li>Allow <strong>location</strong> when you tap Clock in / Check in (it’s only used at that moment).</li>
          <li>Allow the <strong>camera</strong> when you take your ID selfie.</li>
          <li>Long-press the app icon for shortcuts: <em>Check in</em>, <em>My ID card</em>, <em>Schedule</em> (Android).</li>
        </ul>
      </section>
    </main>
  );
}
