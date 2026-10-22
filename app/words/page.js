// 📖 What does this mean? Every short form and term used in the portal, in plain words.
import { requireUser } from '@/lib/auth';
import { GLOSSARY } from '@/lib/plain';

export default async function Words({ searchParams }) {
  const sp = await searchParams;
  await requireUser();
  const q = String(sp?.q ?? '').trim().toLowerCase();
  const list = [...GLOSSARY].sort((a, z) => a.term.localeCompare(z.term))
    .filter((g) => !q || `${g.term} ${g.name} ${g.meaning}`.toLowerCase().includes(q));
  return (
    <main>
      <div className="div-banner">
        <span className="div-icon">📖</span>
        <div><h1>What does this mean?</h1><p>The short forms and words we use at Evergreen, in plain language.</p></div>
      </div>
      <form className="row no-print" style={{ gap: 8, alignItems: 'flex-end' }}>
        <label>Look up a word<input name="q" defaultValue={sp?.q ?? ''} placeholder="e.g. MAR" /></label>
        <button className="secondary">Search</button>
      </form>
      <section className="card">
        {!list.length && <p className="muted">No match. Ask your Program Coordinator — and we’ll add it here.</p>}
        <dl className="words">
          {list.map((g) => (
            <div key={g.term} id={g.term.toLowerCase().replace(/[^a-z0-9]/g, '')}>
              <dt><strong>{g.term}</strong>{g.name !== g.term && <span className="muted"> — {g.name}</span>}</dt>
              <dd>{g.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
