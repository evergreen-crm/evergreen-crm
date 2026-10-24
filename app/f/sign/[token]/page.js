// Outside signer page — opened from the private link in the email. No sign-in needed:
// the person confirms a 6-digit code sent to their email, then reads, fills in the boxes and signs.
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { fmtDate, TZ } from '@/lib/options';
import { signSessionHash } from '@/app/f/sign/actions';
import SignCodeGate from './SignCodeGate';
import SignPanel from '@/app/sign/SignPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign a document · Evergreen Community Care', robots: { index: false, follow: false } };
const when = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

function Shell({ children }) {
  return (
    <main className="if-page" style={{ maxWidth: 900 }}>
      <div className="if-head"><img src="/logo.png" alt="Evergreen Community Care" /></div>
      {children}
      <p className="muted small if-foot">Evergreen Community Care Inc. · This document is private. Please don’t forward this link.</p>
    </main>
  );
}
const Note = ({ title, children }) => <Shell><div className="card"><h2>{title}</h2>{children}</div></Shell>;

export default async function OutsideSignPage({ params }) {
  const { token } = await params;
  if (!/^[0-9a-f]{40,80}$/i.test(token)) return <Note title="This link is not valid." />;
  if (!adminKey()) return <Note title="Signing is not switched on yet."><p>Please contact Evergreen Community Care.</p></Note>;
  const admin = createAdminClient();
  const { data: r } = await admin.rpc('sign_ext_open', { t: token, sess: await signSessionHash(token) });
  if (!r || r.state === 'invalid') return <Note title="This link is not valid."><p>Please contact Evergreen Community Care for a new link.</p></Note>;
  if (r.state === 'cancelled') return <Note title="This request was cancelled."><p>{r.sender ?? 'Evergreen'} cancelled it, so it no longer needs your signature.</p></Note>;

  const head = (
    <div className="if-title card">
      <p className="muted small">Evergreen Community Care · Document to sign</p>
      <h1>{r.title}</h1>
      <p className="small">Hello {r.name}{r.role ? ` (${r.role})` : ''}. {r.sender ?? 'Evergreen Community Care'}{r.house ? ` at ${r.house}` : ''} asked you to read and sign this{r.due ? ` by ${fmtDate(r.due)}` : ''}.</p>
    </div>
  );
  if (r.state === 'code') return <Shell>{head}<SignCodeGate token={token} emailHint={r.email_hint} /></Shell>;

  const fileUrl = (await admin.storage.from('sign-docs').createSignedUrl(r.file_path, 3600)).data?.signedUrl ?? null;
  const finishedUrl = r.filled_path ? (await admin.storage.from('sign-docs').createSignedUrl(r.filled_path, 3600, { download: `${r.title.replace(/[^\w\- ]+/g, '').slice(0, 60) || 'document'} - signed.pdf` })).data?.signedUrl : null;

  if (r.status !== 'Waiting' || r.request_status !== 'Open') {
    return (
      <Shell>
        {head}
        <div className={`card ${r.status === 'Signed' ? 'if-done' : ''}`}>
          {r.status === 'Signed' ? <><h2>✓ Signed</h2><p>You signed this on {when(r.signed_at)} as “{r.signed_name}”. Thank you.</p></>
            : r.status === 'Declined' ? <><h2>You declined</h2><p>You answered on {when(r.declined_at)}. {r.sender ?? 'The sender'} has your reason.</p></>
            : <h2>This document is no longer waiting for signatures.</h2>}
          {finishedUrl ? <p><a className="button" href={finishedUrl}>⬇ Download the finished PDF</a></p>
            : r.status === 'Signed' ? <p className="small muted">When everyone has signed, we’ll email you a copy of the finished document.</p> : null}
          {fileUrl && <p className="small"><a href={fileUrl} target="_blank" rel="noreferrer">View the original document</a></p>}
        </div>
      </Shell>
    );
  }

  const isPdf = /pdf/i.test(r.file_type ?? '') || /\.pdf$/i.test(r.file_name ?? '');
  const isImg = /^image\//i.test(r.file_type ?? '');
  const boxes = Array.isArray(r.fields) ? r.fields : [];
  return (
    <Shell>
      {head}
      {r.message && <div className="card"><strong className="small">Message from {r.sender ?? 'the sender'}</strong><p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{r.message}</p></div>}
      {!(boxes.length && isPdf) && (
        <section className="card">
          <div className="title-row">
            <h2 style={{ margin: 0 }}>📄 {r.file_name}</h2>
            {fileUrl && <a className="button secondary" href={fileUrl} target="_blank" rel="noreferrer">Open in a new tab</a>}
          </div>
          {!fileUrl ? <p className="message error">The document couldn’t be opened. Please refresh the page.</p>
            : isPdf ? <iframe src={fileUrl} title={r.file_name} style={{ width: '100%', height: '70vh', border: '1px solid var(--line)', borderRadius: 8, marginTop: 8, background: '#fff' }} />
            : isImg ? <img src={fileUrl} alt={r.file_name} style={{ maxWidth: '100%', border: '1px solid var(--line)', borderRadius: 8, marginTop: 8 }} />
            : <p className="small">Tap <strong>Open in a new tab</strong> to download and read the document, then come back here to sign.</p>}
        </section>
      )}
      <SignPanel token={token} defaultName={r.name ?? ''} fileUrl={isPdf ? fileUrl : null} fields={isPdf ? boxes : []} slot={r.slot} />
      {r.doc_hash && <p className="muted small" style={{ wordBreak: 'break-all' }}>File fingerprint (SHA-256): {r.doc_hash}</p>}
    </Shell>
  );
}
