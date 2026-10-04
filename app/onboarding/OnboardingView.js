// The onboarding checklist — used by the staff member (/onboarding) and by managers (/hr/[id]/onboarding).
import Link from 'next/link';
import { SECTIONS, templateFor } from '@/lib/onboarding';
import { fmtDate, fmtDateTime, todayISO } from '@/lib/options';
import { savePersonal, submitItem, submitOnboarding, reviewItem, completeOnboarding } from '@/app/onboarding/actions';
import SignaturePad from './SignaturePad';
import StaffFileUpload from './StaffFileUpload';
import PrintButton from '@/app/PrintButton';

const DONE = ['Verified', 'N/A'];
const badge = (s) => ({ Verified: '', 'N/A': '', Submitted: 'warn', Returned: 'bad', 'To do': 'bad' }[s] ?? '');

function Summary({ tpl, item, fileUrl, signature }) {
  const d = item.data ?? {};
  return (
    <div className="small onb-summary">
      {tpl.kind === 'refs' && (d.r1_name || d.r2_name) && (
        <p>1. {d.r1_name} · {d.r1_phone} {d.r1_relationship && `· ${d.r1_relationship}`}<br />2. {d.r2_name} · {d.r2_phone} {d.r2_relationship && `· ${d.r2_relationship}`}</p>
      )}
      {tpl.kind === 'declare' && d.fit && <p>Fit for duty: <strong>{d.fit}</strong>{d.accommodations && ` · Accommodations: ${d.accommodations}`}</p>}
      {tpl.kind === 'training' && d.completed_on && (
        <p>Completed {fmtDate(d.completed_on)}{d.provider && ` · ${d.provider}`}{d.hours && ` · ${d.hours} h`}{d.expires_on && ` · expires ${fmtDate(d.expires_on)}`}{d.notes && ` · ${d.notes}`}</p>
      )}
      {(tpl.kind === 'upload' || tpl.kind === 'manager') && (d.date || d.notes) && <p>{d.date && `Date: ${fmtDate(d.date)}`}{d.notes && ` · ${d.notes}`}</p>}
      {fileUrl && <p><a href={fileUrl} target="_blank" rel="noreferrer">📎 View uploaded file</a></p>}
      {item.signed_name && (
        <div className="signed">
          {signature && <img src={signature} alt="" />}
          <span>Signed electronically by <strong>{item.signed_name}</strong> on {fmtDateTime(item.signed_at)}</span>
        </div>
      )}
      {item.review_note && <p className={item.status === 'Returned' ? 'message' : 'muted'}>Manager note: {item.review_note}</p>}
      {item.reviewed_at && DONE.includes(item.status) && <p className="muted">{item.status} by {item.reviewer?.full_name ?? 'manager'} on {fmtDateTime(item.reviewed_at)}</p>}
    </div>
  );
}

function StaffForm({ tpl, item, profileId, fullName }) {
  const d = item.data ?? {};
  if (tpl.kind === 'manager') return <p className="muted small">Your manager completes this item.</p>;
  return (
    <form action={submitItem} className="onb-form no-print">
      <input type="hidden" name="id" value={item.id} />
      {tpl.kind === 'sign' && (
        <>
          <p className="statement">{tpl.statement}</p>
          <label className="check"><input type="checkbox" name="agree" required /> I have read this and I agree.</label>
          <label>Type your full name to sign<input name="signed_name" required placeholder={fullName} autoComplete="name" /></label>
          <button>Sign</button>
        </>
      )}
      {tpl.kind === 'refs' && (
        <>
          <div className="row">
            <label>Reference 1 name<input name="r1_name" required defaultValue={d.r1_name ?? ''} /></label>
            <label>Phone<input name="r1_phone" required defaultValue={d.r1_phone ?? ''} /></label>
            <label>How you know them<input name="r1_relationship" defaultValue={d.r1_relationship ?? ''} /></label>
          </div>
          <div className="row">
            <label>Reference 2 name<input name="r2_name" required defaultValue={d.r2_name ?? ''} /></label>
            <label>Phone<input name="r2_phone" required defaultValue={d.r2_phone ?? ''} /></label>
            <label>How you know them<input name="r2_relationship" defaultValue={d.r2_relationship ?? ''} /></label>
          </div>
          <button>Submit</button>
        </>
      )}
      {tpl.kind === 'declare' && (
        <>
          <label>Are you able to perform the duties of this role, with or without accommodation?
            <select name="fit" required defaultValue={d.fit ?? ''}><option value="">Choose…</option><option>Yes</option><option>Yes, with accommodation</option><option>No</option></select>
          </label>
          <label>Accommodations needed (optional — no diagnosis needed)<input name="accommodations" defaultValue={d.accommodations ?? ''} /></label>
          <button>Submit</button>
        </>
      )}
      {tpl.kind === 'upload' && (
        <>
          <StaffFileUpload itemId={item.id} profileId={profileId} hasFile={!!item.file_path} />
          <div className="row">
            <label>{item.item_key === 'crc' ? 'Date cleared' : 'Date (optional)'}<input type="date" name="date" defaultValue={d.date ?? ''} required={item.item_key === 'crc'} /></label>
            <label>Notes<input name="notes" defaultValue={d.notes ?? ''} /></label>
          </div>
          <button disabled={!item.file_path}>Submit</button>
        </>
      )}
      {tpl.kind === 'training' && (
        <>
          <div className="row">
            <label>Date completed<input type="date" name="completed_on" required defaultValue={d.completed_on ?? ''} max={todayISO()} /></label>
            <label>Provider<input name="provider" defaultValue={d.provider ?? tpl.provider} /></label>
            <label>Hours<input type="number" step="0.5" min="0" name="hours" defaultValue={d.hours ?? ''} /></label>
            <label>Expiry date (if on the certificate)<input type="date" name="expires_on" defaultValue={d.expires_on ?? ''} /></label>
          </div>
          <label>Notes<input name="notes" defaultValue={d.notes ?? ''} /></label>
          <StaffFileUpload itemId={item.id} profileId={profileId} hasFile={!!item.file_path} />
          <button>Submit</button>
        </>
      )}
    </form>
  );
}

function ReviewForm({ tpl, item }) {
  return (
    <form action={reviewItem} className="onb-review no-print">
      <input type="hidden" name="id" value={item.id} />
      {DONE.includes(item.status) ? (
        <button name="decision" value="reopen" className="link small">Reopen</button>
      ) : (
        <>
          {(tpl.kind === 'manager' || (tpl.kind === 'training' && !item.data?.completed_on)) && (
            <label>{tpl.kind === 'manager' ? 'Date' : 'Completed on (in-house)'}<input type="date" name={tpl.kind === 'manager' ? 'date' : 'completed_on'} defaultValue={todayISO()} /></label>
          )}
          <input name="note" placeholder="Note (required to return)" />
          <button name="decision" value="verify">✓ Verify</button>
          <button name="decision" value="return" className="secondary">Return to fix</button>
          {(tpl.ifApplicable || tpl.kind === 'manager') && <button name="decision" value="na" className="secondary">Not applicable</button>}
        </>
      )}
    </form>
  );
}

export default async function OnboardingView({ supabase, onb, person, viewer }) {
  const { data: items } = await supabase.from('onboarding_items')
    .select('*, reviewer:reviewed_by(full_name)').eq('onboarding_id', onb.id).order('sort');
  const paths = (items ?? []).map((i) => i.file_path).filter(Boolean);
  let urls = {};
  if (paths.length) {
    const { data } = await supabase.storage.from('staff-files').createSignedUrls(paths, 3600);
    urls = Object.fromEntries((data ?? []).map((s) => [s.path, s.signedUrl]));
  }
  const today = todayISO();
  const all = items ?? [];
  const done = all.filter((i) => DONE.includes(i.status)).length;
  const waiting = all.filter((i) => i.status === 'Submitted').length;
  const pct = all.length ? Math.round((100 * done) / all.length) : 0;
  const isSelf = viewer.isSelf;
  const editable = isSelf && onb.status !== 'Complete';
  const p = onb.personal ?? {};

  return (
    <main className="onboarding">
      <div className="div-banner" style={{ '--div': '#5a3d8a' }}>
        <span className="div-icon">👥</span>
        <div>
          <h1>{isSelf ? 'My onboarding' : `Onboarding — ${person.full_name}`}</h1>
          <p>Hire date {fmtDate(onb.hire_date)} · personnel file due {fmtDate(onb.due_date)} · Status: {onb.status}</p>
        </div>
        <span className="no-print"><PrintButton label="Print" /></span>
      </div>

      <div className="progress"><span style={{ width: `${pct}%` }} /></div>
      <p className="small">{done} of {all.length} items complete ({pct}%){viewer.isBoss && waiting > 0 && <> · <span className="badge warn">{waiting} waiting for your review</span></>}</p>
      {isSelf && onb.status !== 'Complete' && (
        <p className="muted small">Work through each section. Items marked <span className="badge bad">To do</span> need you. Your manager verifies each item. You can come back any time — your work is saved.</p>
      )}

      <section className="card">
        <h2>1. Your signature</h2>
        {isSelf ? (
          <>
            {!onb.signature_image && <p className="small">Draw your signature once below. It is placed on every policy you sign.</p>}
            <SignaturePad existing={onb.signature_image} />
          </>
        ) : onb.signature_image ? <div className="sig-show"><img src={onb.signature_image} alt="Signature" /></div> : <p className="muted">Not drawn yet.</p>}
        {onb.signature_at && <p className="muted small">Saved {fmtDateTime(onb.signature_at)}</p>}
      </section>

      <section className="card">
        <h2>2. Personal information</h2>
        {editable ? (
          <form action={savePersonal}>
            <div className="row">
              <label>Legal name<input name="legal_name" required defaultValue={p.legal_name ?? person.full_name} /></label>
              <label>Preferred name<input name="preferred_name" defaultValue={p.preferred_name ?? ''} /></label>
              <label>Pronouns<input name="pronouns" defaultValue={p.pronouns ?? ''} placeholder="e.g., she/her, they/them" /></label>
            </div>
            <div className="row">
              <label>Phone<input name="phone" required defaultValue={p.phone ?? ''} /></label>
              <label>Address<input name="address" defaultValue={p.address ?? ''} /></label>
              <label>City<input name="city" defaultValue={p.city ?? ''} /></label>
              <label>Postal code<input name="postal_code" defaultValue={p.postal_code ?? ''} /></label>
            </div>
            <div className="row">
              <label>Emergency contact<input name="emergency_name" required defaultValue={p.emergency_name ?? ''} /></label>
              <label>Relationship<input name="emergency_relationship" defaultValue={p.emergency_relationship ?? ''} /></label>
              <label>Their phone<input name="emergency_phone" required defaultValue={p.emergency_phone ?? ''} /></label>
            </div>
            <label>Languages spoken<input name="languages" defaultValue={p.languages ?? ''} /></label>
            <p className="muted small">Payroll details (SIN and banking) are collected separately by payroll — please don’t enter them here.</p>
            <button>Save</button>
          </form>
        ) : (
          <dl className="facts">
            <dt>Legal name</dt><dd>{p.legal_name ?? '—'}{p.preferred_name && ` (prefers ${p.preferred_name})`}</dd>
            <dt>Pronouns</dt><dd>{p.pronouns ?? '—'}</dd>
            <dt>Phone</dt><dd>{p.phone ?? '—'}</dd>
            <dt>Address</dt><dd>{[p.address, p.city, p.postal_code].filter(Boolean).join(', ') || '—'}</dd>
            <dt>Emergency contact</dt><dd>{[p.emergency_name, p.emergency_relationship, p.emergency_phone].filter(Boolean).join(' · ') || '—'}</dd>
            <dt>Languages</dt><dd>{p.languages ?? '—'}</dd>
          </dl>
        )}
      </section>

      {SECTIONS.map((s, si) => {
        const list = all.filter((i) => i.section === s.key);
        const sDone = list.filter((i) => DONE.includes(i.status)).length;
        return (
          <section key={s.key} className="onb-section">
            <h2>{si + 3}. {s.title} <span className="muted small">— {sDone} of {list.length} done</span></h2>
            {s.key === 'file' && <p className="muted small">Items 8 (training certificates) and 14 (signed policies) are the next two sections. Items 9, 10, 12 and 13 (evaluations, discipline, rehire, exit interview) are added during and after employment.</p>}
            {list.map((item) => {
              const tpl = templateFor(item.item_key) ?? { kind: 'manager' };
              const overdue = !DONE.includes(item.status) && item.status !== 'Submitted' && item.due_date && item.due_date < today;
              const open = isSelf ? ['To do', 'Returned'].includes(item.status) : item.status === 'Submitted';
              return (
                <details key={item.id} className={`onb-item s-${item.status.replace(/[^a-z]/gi, '')}`} open={open}>
                  <summary>
                    <span className="onb-title">{tpl.no ? `${tpl.no}. ` : ''}{item.title}{tpl.ifApplicable && <span className="muted small"> (if applicable)</span>}</span>
                    <span className="small">
                      {item.due_date && <span className={overdue ? 'badge bad' : 'muted'}>{overdue ? 'Overdue · ' : 'Due '}{fmtDate(item.due_date)}</span>}{' '}
                      <span className={`badge ${badge(item.status)}`}>{item.status}</span>
                    </span>
                  </summary>
                  {(tpl.help || tpl.when) && <p className="muted small">{tpl.help ?? `${tpl.when} · ${tpl.provider}`}</p>}
                  <Summary tpl={tpl} item={item} fileUrl={item.file_path && urls[item.file_path]} signature={item.signed_name && onb.signature_image} />
                  {item.training_id && <p className="small"><Link href={`/hr/certificate/${item.training_id}`}>🏅 View / print certificate</Link></p>}
                  {editable && !DONE.includes(item.status) && <StaffForm tpl={tpl} item={item} profileId={onb.profile_id} fullName={person.full_name} />}
                  {viewer.isBoss && <ReviewForm tpl={tpl} item={item} />}
                </details>
              );
            })}
          </section>
        );
      })}

      <div className="card no-print">
        {isSelf && onb.status !== 'Complete' && (
          <form action={submitOnboarding}>
            <p className="small">When you’ve finished everything you can, send it to your manager. You can still add training later.</p>
            <button>Send to my manager for review</button>
          </form>
        )}
        {viewer.isBoss && onb.status !== 'Complete' && (
          <form action={completeOnboarding}>
            <input type="hidden" name="profile_id" value={onb.profile_id} />
            <p className="small">{all.length - done > 0 ? `${all.length - done} item(s) are not verified yet. ` : 'Everything is verified. '}Mark onboarding complete when the personnel file is ready (PM sign-off).</p>
            <button className={all.length - done > 0 ? 'secondary' : ''}>Mark onboarding complete</button>
          </form>
        )}
        {onb.status === 'Complete' && <p>✓ Onboarding completed {fmtDateTime(onb.completed_at)}.</p>}
        <p className="small"><Link href={`/hr/${onb.profile_id}/certificates`}>🏅 All training certificates</Link></p>
      </div>
      <div className="print-only sign-lines">
        <p>Verified by (Program Coordinator): ____________________ Date: __________</p>
        <p>Signed off by (Program Manager): ____________________ Date: __________</p>
      </div>
    </main>
  );
}
