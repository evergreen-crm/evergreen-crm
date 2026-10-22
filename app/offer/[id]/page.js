// One offer letter: the full document (one saved record), Evergreen's automatic signature, the person's e-signature,
// print / save as PDF, and "email me a copy".
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canHR } from '@/lib/levels';
import { offerHtml } from '@/lib/offerLetter';
import { emailReady } from '@/lib/email';
import PrintButton from '@/app/PrintButton';
import OfferUpload from '../OfferUpload';
import { sendOffer, withdrawOffer, acceptOffer, declineOffer, emailOffer } from '../actions';
import { plainStatus } from '@/lib/plain';
import { plainError } from '@/lib/plain';

const BADGE = { Draft: 'warn', Sent: 'warn', Accepted: '', Declined: 'bad', Withdrawn: 'bad' };

export default async function OfferPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: o } = await supabase.from('offer_letters').select('*, profiles!offer_letters_profile_id_fkey(full_name, email)').eq('id', id).maybeSingle();
  if (!o) notFound();
  const mine = o.profile_id === user.id;
  const hr = canHR(profile) && !mine;
  if (mine && o.status === 'Draft') notFound();
  let fileUrl = null;
  if (o.file_path) {
    const { data } = await supabase.storage.from('staff-files').createSignedUrl(o.file_path, 3600);
    fileUrl = data?.signedUrl ?? null;
  }
  const name = o.profiles?.full_name ?? '';
  const myEmail = o.profiles?.email;
  const { data: onb } = mine ? await supabase.from('onboardings').select('signature_image').eq('profile_id', user.id).maybeSingle() : { data: null };

  return (
    <main>
      <p className="small no-print">{hr ? <Link href={`/hr/${o.profile_id}#offer`}>← {name}’s HR record</Link> : <Link href="/onboarding">← My onboarding</Link>}</p>
      <div className="title-row no-print">
        <h1>Offer letter <span className={`badge ${BADGE[o.status]}`}>{plainStatus(o.status)}</span></h1>
        <PrintButton label="Print / Save as PDF" />
      </div>
      {sp?.ok && <p className="message ok no-print">{sp.ok}</p>}
      {sp?.error && <p className="message no-print">{plainError(sp.error)}</p>}

      {hr && o.status === 'Draft' && (
        <section className="card no-print">
          <p><strong>Draft.</strong> Check the letter below. When you press <strong>Send to sign</strong>, Evergreen’s signature is added automatically with your name, title and the date and time, the terms are locked, and {name} is notified{emailReady() && o.profiles?.email ? ' by portal and email' : ' in the portal'}.</p>
          <OfferUpload offerId={o.id} profileId={o.profile_id} fileName={o.file_name} />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <form action={sendOffer}><input type="hidden" name="id" value={o.id} /><button>✍️ Send to sign</button></form>
            <form action={withdrawOffer}><input type="hidden" name="id" value={o.id} /><button className="secondary">Cancel draft</button></form>
          </div>
        </section>
      )}
      {hr && o.status === 'Sent' && (
        <form action={withdrawOffer} className="card no-print">
          <input type="hidden" name="id" value={o.id} />
          <p>Waiting for {name} to sign. Terms are locked; to change them, withdraw this offer and create a new one.</p>
          <button className="secondary">Withdraw offer</button>
        </form>
      )}

      {mine && o.status === 'Sent' && (
        <section className="card no-print" id="sign">
          <h2>Sign your offer</h2>
          <p className="small">{onb?.signature_image ? 'Your saved signature (from onboarding) will be added to the letter automatically.' : 'Your typed name will be your electronic signature. (You can also draw a signature in My onboarding — it is then added automatically.)'}</p>
          {onb?.signature_image && <img src={onb.signature_image} alt="Your signature" style={{ height: 50, border: '1px solid #d7e0da', borderRadius: 6, background: '#fff' }} />}
          <form action={acceptOffer}>
            <input type="hidden" name="id" value={o.id} />
            <label className="check"><input type="checkbox" name="agree" required /> I have read this offer letter{o.file_path ? ' and the attached letter' : ''}, and I accept the offer of employment on these terms.</label>
            <label>Type your full name to sign — <strong>{profile.full_name}</strong><input name="signed_name" required placeholder={profile.full_name} autoComplete="off" /></label>
            <button>✍️ Accept and sign</button>
          </form>
          <details style={{ marginTop: 10 }}>
            <summary className="small">I want to decline this offer</summary>
            <form action={declineOffer}>
              <input type="hidden" name="id" value={o.id} />
              <label>Reason (optional)<input name="reason" /></label>
              <button className="secondary">Decline the offer</button>
            </form>
          </details>
        </section>
      )}

      <article className="card" style={{ background: '#fff' }} dangerouslySetInnerHTML={{ __html: offerHtml(o, { personName: name, fileUrl }) }} />

      {(mine || hr) && o.status !== 'Draft' && (
        <form action={emailOffer} className="card no-print">
          <input type="hidden" name="id" value={o.id} />
          <h2 style={{ marginTop: 0 }}>📧 Email a copy</h2>
          <p className="small muted">Send this letter to your own email address. The signed original always stays saved here in the portal.</p>
          <div className="row" style={{ alignItems: 'flex-end', gap: 8 }}>
            <label>Email address<input type="email" name="to" required defaultValue={myEmail ?? ''} placeholder="you@example.com" /></label>
            <button className="secondary">Send copy</button>
          </div>
          {!emailReady() && <p className="small bad-text">Email isn’t switched on yet — use Print / Save as PDF for now.</p>}
        </form>
      )}
    </main>
  );
}
