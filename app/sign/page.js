// ✍️ Signatures: documents waiting for my signature, and (for senders) documents I or my team sent.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { fmtDate, TZ } from '@/lib/options';
import { canSend, canManageAll, REQUEST_BADGE, SIGNER_BADGE } from '@/lib/sign';
import NotReady from '@/app/components/NotReady';

export const dynamic = 'force-dynamic';
const when = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

export default async function SignList({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const sender = canSend(profile);
  const all = canManageAll(profile);
  const show = ['open', 'complete', 'cancelled', 'all'].includes(sp.show) ? sp.show : 'open';

  const mineQ = supabase.from('sign_request_signers')
    .select('id, status, signed_at, declined_at, sign_requests!inner(id, title, category, due_date, status, created_at, sender:created_by(full_name))')
    .eq('profile_id', profile.id).order('id');
  let sentQ = null;
  if (sender) {
    sentQ = supabase.from('sign_requests')
      .select('id, title, category, due_date, status, created_at, created_by, sender:created_by(full_name), sign_request_signers(status, profiles(full_name))')
      .order('created_at', { ascending: false }).limit(200);
    if (!all) sentQ = sentQ.eq('created_by', profile.id);
    if (show !== 'all') sentQ = sentQ.eq('status', show === 'open' ? 'Open' : show === 'complete' ? 'Complete' : 'Cancelled');
  }
  const [mineR, sentR] = await Promise.all([mineQ, sentQ ?? Promise.resolve({ data: [] })]);
  if (mineR.error && /sign_request|relation|schema cache|does not exist/i.test(mineR.error.message)) {
    return <main><h1>✍️ Signatures</h1><NotReady what="Sending documents for signature" file="sign-requests.sql" /></main>;
  }
  const mine = (mineR.data ?? []).filter((m) => m.sign_requests);
  const waiting = mine.filter((m) => m.status === 'Waiting' && m.sign_requests.status === 'Open')
    .sort((a, b) => String(a.sign_requests.due_date ?? '9999').localeCompare(String(b.sign_requests.due_date ?? '9999')));
  const answered = mine.filter((m) => m.status !== 'Waiting' || m.sign_requests.status !== 'Open')
    .sort((a, b) => String(b.signed_at ?? b.declined_at ?? b.sign_requests.created_at).localeCompare(String(a.signed_at ?? a.declined_at ?? a.sign_requests.created_at)));
  const sent = sentR.data ?? [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

  return (
    <main>
      <div className="title-row">
        <h1>✍️ Signatures</h1>
        {sender && <Link className="button" href="/sign/new">+ Send a document for signature</Link>}
      </div>
      {sp.sent && <p className="message ok">Sent. Each person got an alert, and it’s on their to-do list.</p>}

      <section className="card">
        <h2>Waiting for my signature {waiting.length > 0 && <span className="badge warn">{waiting.length}</span>}</h2>
        {!waiting.length ? <p className="muted">Nothing to sign right now. 👍</p> : (
          <ul className="list">
            {waiting.map((m) => {
              const r = m.sign_requests; const late = r.due_date && r.due_date < today;
              return (
                <li key={m.id}>
                  <Link href={`/sign/${r.id}`}><strong>{r.title}</strong></Link>
                  <span className="muted small"> · {r.category} · from {r.sender?.full_name ?? '—'} · sent {fmtDate(r.created_at.slice(0, 10))}</span>
                  {r.due_date && <span className={`badge ${late ? 'bad' : 'warn'}`}> {late ? 'Overdue — was due' : 'Due'} {fmtDate(r.due_date)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {answered.length > 0 && (
        <details className="card">
          <summary><strong>Documents I signed or answered ({answered.length})</strong></summary>
          <ul className="list">
            {answered.map((m) => (
              <li key={m.id}>
                <Link href={`/sign/${m.sign_requests.id}`}>{m.sign_requests.title}</Link>{' '}
                <span className={`badge ${SIGNER_BADGE[m.status] ?? ''}`}>{m.status}</span>
                <span className="muted small"> · {m.status === 'Signed' ? `signed ${when(m.signed_at)}` : m.status === 'Declined' ? `declined ${when(m.declined_at)}` : `request ${m.sign_requests.status.toLowerCase()}`}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {sender && (
        <section className="card">
          <div className="title-row">
            <h2>{all ? 'Documents sent for signature' : 'Documents I sent'}</h2>
            <span className="small">
              {[['open', 'Waiting'], ['complete', 'Done'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, l], i) => (
                <span key={k}>{i ? ' · ' : ''}{show === k ? <strong>{l}</strong> : <Link href={`/sign?show=${k}`}>{l}</Link>}</span>
              ))}
            </span>
          </div>
          {sentR.error ? <p className="message error">{sentR.error.message}</p> : !sent.length ? <p className="muted">None here.</p> : (
            <table>
              <thead><tr><th>Document</th><th>Sent</th><th>Signed</th><th>Status</th></tr></thead>
              <tbody>
                {sent.map((r) => {
                  const ss = r.sign_request_signers ?? [];
                  const signed = ss.filter((s) => s.status === 'Signed').length;
                  const declined = ss.filter((s) => s.status === 'Declined').length;
                  const waitingNames = ss.filter((s) => s.status === 'Waiting').map((s) => s.profiles?.full_name).filter(Boolean);
                  return (
                    <tr key={r.id}>
                      <td><Link href={`/sign/${r.id}`}><strong>{r.title}</strong></Link><br /><span className="muted small">{r.category}{all && r.created_by !== profile.id ? ` · by ${r.sender?.full_name ?? '—'}` : ''}</span></td>
                      <td className="small">{fmtDate(r.created_at.slice(0, 10))}{r.due_date ? <><br /><span className={r.status === 'Open' && r.due_date < today ? 'bad-text' : 'muted'}>due {fmtDate(r.due_date)}</span></> : null}</td>
                      <td className="small">{signed} of {ss.length}{declined ? <> · <span className="bad-text">{declined} declined</span></> : null}
                        {r.status === 'Open' && waitingNames.length > 0 && <><br /><span className="muted">Waiting: {waitingNames.slice(0, 4).join(', ')}{waitingNames.length > 4 ? ` +${waitingNames.length - 4}` : ''}</span></>}</td>
                      <td><span className={`badge ${REQUEST_BADGE[r.status] ?? ''}`}>{r.status === 'Open' ? 'Waiting' : r.status === 'Complete' ? 'Done' : 'Cancelled'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}
