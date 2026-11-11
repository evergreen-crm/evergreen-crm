// 🔍 Searches with no result: what people typed in Find that matched no page. Directors and the Administrator.
// Use it to add the missing words to lib/findGuide.js (ask Claude) or to rename a page people can't find.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf, groupOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Searches with no result · Evergreen' };

export default async function FindMisses() {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!(profile.role === 'admin' || (levelOf(profile) >= 4 && !groupOf(profile)))) redirect('/more?error=' + encodeURIComponent('This page is for directors and the administrator.'));
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const { data: rows, error } = await supabase.from('find_misses').select('q, role_label, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(1000);
  const groups = new Map();
  for (const r of rows ?? []) {
    const k = r.q.toLowerCase();
    const g = groups.get(k) ?? { q: r.q, n: 0, last: r.created_at, roles: new Set() };
    g.n++; if (r.role_label) g.roles.add(r.role_label);
    groups.set(k, g);
  }
  const list = [...groups.values()].sort((a, b) => b.n - a.n || (a.last < b.last ? 1 : -1));
  const day = (ts) => fmtDate(new Date(new Date(ts).getTime() - 7 * 3600e3).toISOString().slice(0, 10));
  return (
    <main>
      <p className="small no-print"><Link href="/s/qa">← Quality</Link></p>
      <h1>🔍 Searches with no result</h1>
      <p className="small">What people typed in Find over the last 90 days that matched no page and no “How do I…?” answer. The most common ones show where staff get lost: add those words to the page, or rename the page.</p>
      {error && <p className="message">This list isn’t switched on yet (setup file: find-misses.sql).</p>}
      {!error && !list.length && <p className="card muted">Nothing yet. Every search so far found a page.</p>}
      {!!list.length && (
        <table>
          <thead><tr><th>What they typed</th><th>Times</th><th>Who (job)</th><th>Last time</th></tr></thead>
          <tbody>{list.map((g) => (
            <tr key={g.q}><td>{g.q}</td><td>{g.n}</td><td className="small">{[...g.roles].join(', ') || '—'}</td><td className="small muted">{day(g.last)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </main>
  );
}
