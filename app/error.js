'use client';
// Friendly error page: what happened in plain words, and what to do next. Nothing typed on this device is lost
// for daily notes (they are kept on the device), but other forms may need to be filled in again.
import Link from 'next/link';
import { plainError } from '@/lib/plain';

export default function Error({ error, reset }) {
  const msg = error?.message && !/Server Components render|digest/i.test(error.message) ? plainError(error.message) : null;
  return (
    <main>
      <section className="card">
        <h1 style={{ marginTop: 0 }}>Sorry — that didn’t work</h1>
        <p>{msg ?? 'Something went wrong while saving or loading this page.'}</p>
        <ul>
          <li>Try again — it often works the second time.</li>
          <li>If you were away for a while, you may have been signed out. Sign in and try again.</li>
          <li>Still not working? Tell your Program Coordinator what you were doing and the time.</li>
        </ul>
        <div className="row" style={{ gap: 8 }}>
          <button onClick={() => reset()}>Try again</button>
          <Link href="/portal" className="button secondary">Go to my home page</Link>
        </div>
        {error?.digest && <p className="muted small">Reference for the office: {error.digest}</p>}
      </section>
    </main>
  );
}
