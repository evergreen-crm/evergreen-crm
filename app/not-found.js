import Link from 'next/link';

export default function NotFound() {
  return (
    <main>
      <section className="card">
        <h1 style={{ marginTop: 0 }}>We couldn’t find that page</h1>
        <p>The link may be old, or the item may have been moved.</p>
        <Link href="/portal" className="button">Go to my home page</Link>
      </section>
    </main>
  );
}
