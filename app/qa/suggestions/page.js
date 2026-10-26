// 💡 Staff suggestions (COA PQI / CR): every idea, concern, compliment and CRM problem staff send with the
// 💡 Suggest button. Directors set the status, write an answer (the sender is alerted) and can open an action.
import Link from 'next/link';
import { fmtDate } from '@/lib/options';
import { personLabel } from '@/lib/levels';
import { plainError } from '@/lib/plain';
import { SUGGESTION_STATUSES, SUGGESTION_KINDS, kindIcon } from '@/lib/suggestions';
import { answerSuggestion } from '@/app/suggest/actions';
import { requireQa } from '../guard';
import QaShell from '../QaShell';

export const dynamic = 'force-dynamic';

export default async function QaSuggestions({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, user, profile } = await requireQa('/qa/suggestions');
  const show = ['open', 'done', 'all'].includes(sp.show) ? sp.show : 'open';
  let q = supabase.from('suggestions').select('id, kind, message, page, anonymous, status, response, responded_at, action_id, created_at, home:home_id(name), sender:submitted_by(full_name), answerer:responded_by(full_name)');
  if (show === 'open') q = q.in('status', ['New', 'Reviewing']);
  if (show === 'done') q = q.in('status', ['Done', 'Not possible']);
  if (SUGGESTION_KINDS.some((k) => k.key === sp.kind)) q = q.eq('kind', sp.kind);
  const [{ data, error }, { data: people }] = await Promise.all([
    q.order('created_at', { ascending: false }).limit(300),
    supabase.from('profiles').select('id, full_name, role, level').eq('active', true).gte('level', 2).neq('role', 'family').order('full_name'),
  ]);
  const list = data ?? [];
  const missing = error && /relation|schema/i.test(error.message);

  return (
    <QaShell active="/qa/suggestions" title="Quality assurance — staff suggestions" printedBy={profile.full_name}
      intro="Sent by staff with the 💡 Suggest button on every page (with or without their name). Answer within 2 business days: set the status, write a reply (named senders get an alert), and open an improvement action when something needs fixing.">
      {sp.ok && <p className="message ok no-print">{sp.ok}</p>}
      {(sp.error || (error && !missing)) && <p className="message error no-print">{plainError(sp.error ?? error.message)}</p>}
      {missing ? <p className="message">Run supabase/suggestions-surveys.sql in Supabase first.</p> : (
        <>
          <p className="small no-print">
            {[['open', 'Open'], ['done', 'Answered'], ['all', 'All']].map(([k, l], i) => <span key={k}>{i ? ' · ' : ''}{show === k ? <strong>{l}</strong> : <Link href={`/qa/suggestions?show=${k}`}>{l}</Link>}</span>)}
            {' '}— {SUGGESTION_KINDS.map((k, i) => <span key={k.key}>{i ? ' · ' : ''}<Link href={`/qa/suggestions?show=${show}&kind=${encodeURIComponent(k.key)}`}>{k.icon} {k.key}</Link></span>)}
          </p>
          {!list.length ? <p className="card muted small">Nothing here yet. Staff send suggestions with the 💡 Suggest button at the top of every page.</p> : list.map((g) => (
            <section key={g.id} id={`g-${g.id}`} className={`card qa-std qa-std-${g.status === 'New' ? 'red' : g.status === 'Reviewing' ? 'yellow' : 'green'}`}>
              <div className="title-row">
                <strong>{kindIcon(g.kind)} {g.kind}</strong>
                <span className="small muted">{fmtDate(g.created_at.slice(0, 10))} · {g.anonymous ? 'sent without a name' : g.sender?.full_name ?? '—'}{g.home?.name ? ` · ${g.home.name}` : ''}</span>
              </div>
              <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{g.message}</p>
              {g.response && <p className="small"><strong>Answer</strong> ({g.answerer?.full_name ?? '—'}{g.responded_at ? `, ${fmtDate(g.responded_at.slice(0, 10))}` : ''}): {g.response}</p>}
              {g.action_id && <p className="small"><Link href={`/action-items/${g.action_id}`}>Improvement action →</Link></p>}
              <form action={answerSuggestion} className="qa-std-form no-print">
                <input type="hidden" name="id" value={g.id} />
                <div className="row">
                  <label>Status<select name="status" defaultValue={g.status === 'New' ? 'Reviewing' : g.status}>{SUGGESTION_STATUSES.map((x) => <option key={x}>{x}</option>)}</select></label>
                  {!g.action_id && <label className="inline"><input type="checkbox" name="make_action" /> Open an improvement action</label>}
                  {!g.action_id && <label>Action owner<select name="action_owner" defaultValue={user.id}>{(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name} ({personLabel(p)})</option>)}</select></label>}
                </div>
                <label>Answer{g.anonymous ? ' (for the record — the sender can’t be told)' : ' (the sender gets an alert)'}<textarea name="response" rows={2} maxLength={3000} defaultValue={g.response ?? ''} /></label>
                <button>Save</button>
              </form>
            </section>
          ))}
        </>
      )}
    </QaShell>
  );
}
