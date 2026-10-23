// One document sent for signature: read it, sign or decline (signers), or follow it up (sender, HR, PM+).
// The page also prints as the signed record: document details, its fingerprint, and each signature.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { fmtDate, TZ } from '@/lib/options';
import { canManageAll, REQUEST_BADGE, SIGNER_BADGE } from '@/lib/sign';
import PrintButton from '@/app/PrintButton';
import SignBox from './SignBox';
import SenderTools from './SenderTools';

export const dynamic = 'force-dynamic';
const when = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const size = (b) => (!b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

export default async function SignRequestPage({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: r } = await supabase.from('sign_requests')
    .select('*, sender:created_by(full_name), canceller:cancelled_by(full_name)').eq('id', id).maybeSingle();
  if (!r) notFound();
  const { data: signers } = await supabase.from('sign_request_signers')
    .select('id, profile_id, status, viewed_at, signed_at, signed_name, signature_image, decline_reason, declined_at, reminded_at, profiles(full_name, homes(name))')
    .eq('request_id', id).order('status');
  const list = (signers ?? []).sort((a, b) => (a.profiles?.full_name ?? '').localeCompare(b.profiles?.full_name ?? ''));
  const me = list.find((s) => s.profile_id === profile.id);
  const isSender = r.created_by === profile.id;
  const manage = isSender || canManageAll(profile);
  if (me && !me.viewed_at && me.status === 'Waiting' && r.status === 'Open') await supabase.rpc('sign_viewed', { p_request: id });

  const { data: url } = await supabase.storage.from('sign-docs').createSignedUrl(r.file_path, 3600);
  const fileUrl = url?.signedUrl ?? null;
  const isPdf = /pdf/i.test(r.file_type ?? '') || /\.pdf$/i.test(r.file_name);
  const isImg = /^image\//i.test(r.file_type ?? '') || /\.(jpe?g|png|webp)$/i.test(r.file_name);
  const signed = list.filter((s) => s.status === 'Signed').length;
  const canSignNow = me && me.status === 'Waiting' && r.status === 'Open';

  return (
    <main className="report">
      <p className="small no-print"><Link href="/sign">← Signatures</Link></p>
      {sp.sent && <p className="message ok no-print">Sent to {list.length} {list.length === 1 ? 'person' : 'people'}. Each one got an alert and a to-do item.</p>}

      <div className="title-row">
        <h1 style={{ marginBottom: 0 }}>✍️ {r.title}</h1>
        <span className={`badge ${REQUEST_BADGE[r.status] ?? ''}`}>{r.status === 'Open' ? 'Waiting for signatures' : r.status === 'Complete' ? 'Everyone answered' : 'Cancelled'}</span>
      </div>
      <p className="muted small">
        {r.category} · sent by {r.sender?.full_name ?? '—'} on {when(r.created_at)}{r.due_date ? ` · sign by ${fmtDate(r.due_date)}` : ''}{manage ? ` · ${signed} of ${list.length} signed` : ''}
      </p>
      {r.status === 'Cancelled' && <p className="message error">Cancelled {when(r.cancelled_at)}{r.canceller?.full_name ? ` by ${r.canceller.full_name}` : ''}{r.cancel_reason ? ` — ${r.cancel_reason}` : ''}. It can no longer be signed.</p>}
      {r.message && <div className="card"><strong className="small">Message</strong><p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{r.message}</p></div>}

      <section className="card no-print">
        <div className="title-row">
          <h2 style={{ margin: 0 }}>📄 {r.file_name} <span className="muted small">{size(r.file_size)}</span></h2>
          {fileUrl && <a className="button secondary" href={fileUrl} target="_blank" rel="noreferrer">Open in a new tab</a>}
        </div>
        {!fileUrl ? <p className="message error">The document couldn’t be opened. Refresh the page; if it still fails, tell the office.</p>
          : isPdf ? <iframe src={fileUrl} title={r.file_name} style={{ width: '100%', height: '70vh', border: '1px solid var(--line)', borderRadius: 8, marginTop: 8, background: '#fff' }} />
          : isImg ? <img src={fileUrl} alt={r.file_name} style={{ maxWidth: '100%', border: '1px solid var(--line)', borderRadius: 8, marginTop: 8 }} />
          : <p className="small">Word documents can’t be shown here. Tap <strong>Open in a new tab</strong> to download and read it, then come back to sign.</p>}
      </section>

      {canSignNow && <SignBox id={r.id} defaultName={profile.full_name ?? ''} />}
      {me && me.status !== 'Waiting' && (
        <p className={`message ${me.status === 'Signed' ? 'ok' : 'error'}`}>
          {me.status === 'Signed' ? `You signed this on ${when(me.signed_at)} as “${me.signed_name}”.` : `You declined on ${when(me.declined_at)}: ${me.decline_reason}`}
        </p>
      )}

      {(manage || me) && (
        <section className="card">
          <div className="title-row">
            <h2 style={{ margin: 0 }}>Signed record</h2>
            {manage && <PrintButton label="🖨 Print signed record" />}
          </div>
          <dl className="facts" style={{ marginTop: 8 }}>
            <dt>Document</dt><dd>{r.title} ({r.file_name})</dd>
            <dt>Type</dt><dd>{r.category}</dd>
            <dt>Sent by</dt><dd>{r.sender?.full_name ?? '—'} · {when(r.created_at)}</dd>
            {r.doc_hash && <><dt>File fingerprint</dt><dd className="small" style={{ wordBreak: 'break-all' }}>SHA-256 {r.doc_hash}</dd></>}
          </dl>
          <table>
            <thead><tr><th>Person</th><th>Status</th><th>Opened</th><th>Signed / declined</th>{manage && <th>Signature</th>}</tr></thead>
            <tbody>
              {(manage ? list : list.filter((s) => s.profile_id === profile.id)).map((s) => (
                <tr key={s.id}>
                  <td className="small">{s.profiles?.full_name ?? '—'}<br /><span className="muted">{s.profiles?.homes?.name ?? ''}</span></td>
                  <td><span className={`badge ${SIGNER_BADGE[s.status] ?? ''}`}>{s.status}</span>{s.reminded_at && s.status === 'Waiting' ? <><br /><span className="muted small">reminded {when(s.reminded_at)}</span></> : null}</td>
                  <td className="small">{when(s.viewed_at)}</td>
                  <td className="small">{s.status === 'Signed' ? <>{when(s.signed_at)}<br />typed “{s.signed_name}”</> : s.status === 'Declined' ? <>{when(s.declined_at)}<br /><span className="bad-text">{s.decline_reason}</span></> : '—'}</td>
                  {manage && <td>{s.signature_image ? <img src={s.signature_image} alt={`Signature of ${s.signed_name}`} style={{ height: 48, background: '#fff', borderBottom: '1px solid #333' }} /> : ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small print-only">Printed {when(new Date().toISOString())} by {profile.full_name} · Evergreen Community Care Inc. · Confidential</p>
        </section>
      )}

      {manage && r.status === 'Open' && <SenderTools id={r.id} waiting={list.filter((s) => s.status === 'Waiting').length} canCancel={isSender || canManageAll(profile)} />}
    </main>
  );
}
