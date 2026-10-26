// 💡 My suggestions: send one, and see the answers to the ones I sent with my name.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { fmtDate } from '@/lib/options';
import { plainError } from '@/lib/plain';
import { SUGGESTION_KINDS, kindIcon } from '@/lib/suggestions';
import { sendSuggestionForm } from './actions';

export const dynamic = 'force-dynamic';

export default async function MySuggestions({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.from('suggestions').select('id, kind, message, status, response, responded_at, created_at').eq('submitted_by', user.id).order('created_at', { ascending: false }).limit(100);
  return (
    <main>
      <h1>💡 My suggestions</h1>
      <p className="small muted">Ideas, concerns, compliments and CRM problems go to the directors. You can also send one from any page with the 💡 Suggest button at the top.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message error">{plainError(sp.error)}</p>}
      <form action={sendSuggestionForm} className="card">
        <div className="row">
          <label>Kind<select name="kind" defaultValue="Idea">{SUGGESTION_KINDS.map((k) => <option key={k.key} value={k.key}>{k.icon} {k.key}</option>)}</select></label>
        </div>
        <label>Your message<textarea name="message" rows={4} required minLength={3} maxLength={3000} /></label>
        <label className="check"><input type="checkbox" name="anonymous" /> Send without my name (you won’t see an answer)</label>
        <button>Send</button>
      </form>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Sent with my name</h2>
        {error ? <p className="muted small">{/relation|schema/i.test(error.message) ? 'Suggestions aren’t switched on yet.' : error.message}</p>
          : !data?.length ? <p className="muted small">None yet.</p> : (
          <ul className="plain-list">{data.map((g) => (
            <li key={g.id} style={{ marginBottom: 12 }}>
              <strong>{kindIcon(g.kind)} {g.kind}</strong> <span className="muted small">· {fmtDate(g.created_at.slice(0, 10))}</span> <span className={`badge ${g.status === 'Done' ? '' : 'warn'}`}>{g.status}</span>
              <div style={{ whiteSpace: 'pre-wrap' }}>{g.message}</div>
              {g.response && <div className="message ok small" style={{ marginTop: 4 }}><strong>Answer{g.responded_at ? ` (${fmtDate(g.responded_at.slice(0, 10))})` : ''}:</strong> {g.response}</div>}
            </li>
          ))}</ul>
        )}
      </section>
      <p className="small"><Link href="/">← Home</Link></p>
    </main>
  );
}
