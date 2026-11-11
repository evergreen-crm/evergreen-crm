// Job and offer letter for one person. A Program Coordinator (their own house), a manager or HR chooses the
// position, full-time or part-time, hours and start date. Saving writes the offer letter and sends it to sign.
// The pay comes from the pay rate table, so nobody types a wage here. supabase/auto-offer.sql
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canHR, levelOf, groupOf } from '@/lib/levels';
import { plainStatus, plainError } from '@/lib/plain';
import { fmtDate } from '@/lib/options';
import { saveJob } from './actions';
import OfferVersionUpload from './OfferVersionUpload';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Job and offer letter · Evergreen' };
const BADGE = { Draft: 'warn', Sent: 'warn', Accepted: '', Declined: 'bad', Withdrawn: 'bad' };

export default async function JobAndOffer({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lead = canHR(profile) || (levelOf(profile) >= 2 && !groupOf(profile));
  if (!lead) redirect('/?error=' + encodeURIComponent('Job and offer letters are set up by Program Coordinators, managers and HR.'));
  const [{ data: person }, { data: details }, { data: positions }, { data: offers }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, active, homes(name)').eq('id', id).maybeSingle(),
    supabase.from('staff_details').select('position, employment_type, hours_per_week, hire_date').eq('profile_id', id).maybeSingle(),
    supabase.rpc('pay_positions'),
    supabase.from('offer_letters').select('id, status, position, employment_type, hours, wage, auto, created_at, issued_at, accepted_at').eq('profile_id', id).order('created_at', { ascending: false }),
  ]);
  if (!person) notFound();
  const mine = person.id === user.id;
  // Uploaded offer letters: every version is kept (supabase/offer-uploads.sql). Leaders only, never the person.
  const { data: uploads } = mine ? { data: [] } : await supabase.from('offer_uploads')
    .select('id, version, file_path, file_name, file_size, note, uploaded_at, who:uploaded_by(full_name)').eq('profile_id', id).order('version', { ascending: false });
  const links = {};
  if ((uploads ?? []).length) {
    const { data: signed } = await supabase.storage.from('staff-files').createSignedUrls(uploads.map((u) => u.file_path), 3600);
    (signed ?? []).forEach((s, i) => { if (s?.signedUrl) links[uploads[i].id] = s.signedUrl; });
  }
  const size = (n) => (n == null ? '' : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
  const list = positions ?? [];
  const posList = details?.position && !list.includes(details.position) ? [details.position, ...list] : list;
  const day = (ts) => (ts ? fmtDate(new Date(new Date(ts).getTime() - 7 * 3600e3).toISOString().slice(0, 10)) : '');

  return (
    <main>
      <p className="small no-print">{canHR(profile) ? <Link href={`/hr/${id}`}>← {person.full_name}’s HR record</Link> : <Link href="/homes">← Houses</Link>}</p>
      <h1>📄 Job and offer letter</h1>
      <p className="muted">{person.full_name} · {person.homes?.name ?? 'No house yet'}</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{plainError(sp.error)}</p>}

      {mine ? <p className="card muted">You can’t set up your own job. Your leader does this for you.</p> : (
        <form action={saveJob} className="card">
          <input type="hidden" name="profile_id" value={id} />
          <h2 style={{ marginTop: 0 }}>1. Choose the job</h2>
          <div className="row">
            <label>Position
              <select name="position" required defaultValue={details?.position ?? ''}>
                <option value="">Choose…</option>
                {posList.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label>Full-time or part-time
              <select name="employment_type" required defaultValue={['Full-time', 'Part-time'].includes(details?.employment_type) ? details.employment_type : ''}>
                <option value="">Choose…</option>
                <option>Full-time</option>
                <option>Part-time</option>
              </select>
            </label>
          </div>
          <div className="row">
            <label>Hours each week
              <input name="hours_per_week" type="number" inputMode="decimal" step="0.5" min="1" max="60" defaultValue={details?.hours_per_week ?? ''} placeholder="36 full-time · 20 part-time" />
            </label>
            <label>Start date<input name="hire_date" type="date" required defaultValue={details?.hire_date ?? ''} /></label>
          </div>
          <p className="small muted">Leave the hours blank to use 36 for full-time or 20 for part-time. The pay comes from Evergreen’s pay rate for the position.</p>
          <h2>2. Save</h2>
          <p className="small">When you save, the offer letter is written and sent to {person.full_name} to sign in the portal. It is signed for Evergreen as “Evergreen Community Care Inc., Human Resources”. If you change the job later, the old unsigned letter is withdrawn and a new one is sent.</p>
          <button>Save and send the offer letter</button>
        </form>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Offer letters</h2>
        {!(offers ?? []).length && <p className="muted small">No offer letter yet.</p>}
        <ul className="list compact">
          {(offers ?? []).map((o) => (
            <li key={o.id}>
              <Link href={`/offer/${o.id}`}><strong>{o.position}{o.employment_type ? ` · ${o.employment_type}` : ''}</strong>{' '}
                <span className="muted small">· {o.hours ?? ''}{o.accepted_at ? ` · signed ${day(o.accepted_at)}` : o.issued_at ? ` · sent ${day(o.issued_at)}` : ` · made ${day(o.created_at)}`}{o.status === 'Draft' && o.auto && o.wage == null ? ' · waiting for a pay rate' : ''}</span></Link>
              <span className={`badge ${BADGE[o.status] ?? ''}`}>{o.status === 'Accepted' ? '✓ Signed' : plainStatus(o.status)}</span>
            </li>
          ))}
        </ul>
        <p className="small muted">Open a letter to read it, print it or save it as a PDF. A signed letter is also saved as a PDF in the person’s staff file.</p>
      </section>

      {!mine && (
        <section className="card" id="uploads">
          <h2 style={{ marginTop: 0 }}>Uploaded offer letters</h2>
          <p className="small">Have your own offer letter file? Upload it here. Every upload is kept as a new version; nothing is replaced or deleted. Only leaders see these files, not {person.full_name}.</p>
          {!(uploads ?? []).length && <p className="muted small">No uploaded versions yet.</p>}
          <ul className="list compact">
            {(uploads ?? []).map((u, i) => (
              <li key={u.id}>
                {links[u.id]
                  ? <a href={links[u.id]} target="_blank" rel="noreferrer"><strong>Version {u.version}</strong> · {u.file_name} <span className="muted small">· {size(u.file_size)} · {day(u.uploaded_at)}{u.who?.full_name ? ` · ${u.who.full_name}` : ''}{u.note ? ` · ${u.note}` : ''}</span></a>
                  : <span><strong>Version {u.version}</strong> · {u.file_name} <span className="muted small">· {day(u.uploaded_at)}{u.note ? ` · ${u.note}` : ''}</span></span>}
                {i === 0 && <span className="badge">Latest</span>}
              </li>
            ))}
          </ul>
          <OfferVersionUpload profileId={id} nextVersion={((uploads ?? [])[0]?.version ?? 0) + 1} />
        </section>
      )}
    </main>
  );
}
