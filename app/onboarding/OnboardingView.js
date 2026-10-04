// The onboarding checklist — used by the staff member (/onboarding) and by managers (/hr/[id]/onboarding).
import Link from 'next/link';
import { SECTIONS, LEGACY_SECTIONS, templateFor, appliesTo } from '@/lib/onboarding';
import ProgramBadge from '@/app/components/ProgramBadge';
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

// Progress graph: a 0–100% ring plus one bar per part of the checklist.
function ProgressPanel({ overall, parts, waiting }) {
  const pct = overall.total ? Math.round((100 * overall.done) / overall.total) : 0;
  const r = 52, c = 2 * Math.PI * r;
  const color = pct === 100 ? '#0b5a34' : pct >= 50 ? '#2e8b57' : '#d4a72c';
  return (
    <div className="progress-panel card">
      <svg viewBox="0 0 130 130" className="ring" role="img" aria-label={`${pct}% complete`}>
        <circle cx="65" cy="65" r={r} fill="none" stroke="#e7ece8" strokeWidth="14" />
        <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 65 65)" />
        <text x="65" y="62" textAnchor="middle" fontSize="26" fontWeight="700" fill="#0f3059">{pct}%</text>
        <text x="65" y="82" textAnchor="middle" fontSize="11" fill="#6a736d">complete</text>
      </svg>
      <div className="progress-bars">
        <p className="small"><strong>{overall.done} of {overall.total}</strong> items done{waiting > 0 && <> · <span className="badge warn">{waiting} waiting for your review</span></>}</p>
        {parts.map((p) => {
          const v = p.total ? Math.round((100 * p.done) / p.total) : 0;
          return (
            <div key={p.label} className="pbar">
              <span className="pbar-label">{p.label}</span>
              <span className="pbar-track"><span style={{ width: `${v}%` }} /></span>
              <span className="pbar-num">{v}%</span>
            </div>
          );
        })}
        <div className="pbar-scale"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      </div>
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
          <label>Type your full name to sign — <strong>{fullName}</strong><input name="signed_name" required placeholder={fullName} autoComplete="off" /></label>
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

export default async function OnboardingView({ supabase, onb, person, viewer, notice }) {
  const { data: items } = await supabase.from('onboarding_items')
    .select('*, reviewer:reviewed_by(full_name)').eq('onboarding_id', onb.id).order('sort');
  const paths = (items ?? []).map((i) => i.file_path).filter(Boolean);
  let urls = {};
  if (paths.length) {
    const { data } = await supabase.storage.from('staff-files').createSignedUrls(paths, 3600);
    urls = Object.fromEntries((data ?? []).map((s) => [s.path, s.signedUrl]));
  }
  const [{ data: policiesAll }, { data: acks }] = await Promise.all([
    supabase.from('policies').select('id, title, code, applies_to, current_version_id, current:current_version_id(version_label)')
      .eq('active', true).eq('require_signature', true).order('title'),
    supabase.from('policy_acks').select('policy_version_id, signed_at, signed_name').eq('profile_id', onb.profile_id),
  ]);
  const { data: idCard } = await supabase.from('id_cards').select('photo_status, photo_note, issued_on, expires_on, location_ack_at').eq('profile_id', onb.profile_id).maybeSingle();
  const idDone = (idCard?.photo_status === 'Approved' ? 1 : 0) + (idCard?.location_ack_at ? 1 : 0);
  const program = onb.program ?? 'Both';
  const policies = (policiesAll ?? []).filter((p) => appliesTo(p.applies_to, program));
  const ackFor = (pol) => acks?.find((a) => a.policy_version_id === pol.current_version_id);
  const polSigned = (policies ?? []).filter(ackFor).length;
  const today = todayISO();
  const all = items ?? [];
  const done = all.filter((i) => DONE.includes(i.status)).length + 0;
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
          <p>Program: {program === 'Both' ? 'MCFD & CLBC' : program} · Hire date {fmtDate(onb.hire_date)} · personnel file due {fmtDate(onb.due_date)} · Status: {onb.status}</p>
        </div>
        <span className="no-print"><PrintButton label="Print" /></span>
      </div>

      {notice && <p className={`message ${notice.bad ? '' : 'ok'}`}>{notice.text}</p>}
      <ProgressPanel
        overall={{ done: done + polSigned + idDone, total: all.length + (policies?.length ?? 0) + 2 }}
        parts={[
          { label: 'Signature & personal info', done: (onb.signature_image ? 1 : 0) + (onb.personal?.phone ? 1 : 0), total: 2 },
          { label: 'Digital ID card', done: idDone, total: 2 },
          { label: 'Personnel file', done: all.filter((i) => i.section === 'file' && DONE.includes(i.status)).length, total: all.filter((i) => i.section === 'file').length },
          { label: 'Policies signed', done: polSigned, total: policies?.length ?? 0 },
          { label: 'Evergreen Academy training', done: all.filter((i) => i.section === 'training' && DONE.includes(i.status)).length, total: all.filter((i) => i.section === 'training').length },
        ]}
        waiting={viewer.isBoss ? waiting : 0}
      />
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


      <section className="card" id="id-card">
        <h2>2b. Digital ID card &amp; shift check-in</h2>
        <p className="small">
          Photo: <span className={`badge ${idCard?.photo_status === 'Approved' ? '' : idCard?.photo_status === 'Pending' ? 'warn' : 'bad'}`}>{idCard?.photo_status === 'Approved' ? '✓ Approved' : idCard?.photo_status === 'Pending' ? 'Waiting for approval' : idCard?.photo_status === 'Returned' ? 'New photo needed' : 'To do'}</span>
          {' · '}Location notice: <span className={`badge ${idCard?.location_ack_at ? '' : 'bad'}`}>{idCard?.location_ack_at ? '✓ Read' : 'To do'}</span>
          {idCard?.issued_on && <> · Card issued {fmtDate(idCard.issued_on)}, valid until {fmtDate(idCard.expires_on)}</>}
        </p>
        {idCard?.photo_status === 'Returned' && idCard.photo_note && <p className="message small">Manager note: {idCard.photo_note}</p>}
        <p className="small">Your ID card lives on your phone. Add a photo, read the location notice, and your manager issues the card. Your emergency contact (above) is printed on the back. While on shift you check in from the card every few hours.</p>
        <p className="no-print"><Link className="button" href={isSelf ? '/id' : `/id?person=${onb.profile_id}`}>{isSelf ? 'Open my ID card' : 'Open ID card'}</Link>
          {viewer.isBoss && <> <Link className="button secondary" href={`/hr/${onb.profile_id}#id-card`}>Approve / issue</Link></>}</p>
      </section>

      {[...SECTIONS, ...LEGACY_SECTIONS].map((s, si) => {
        const list = all.filter((i) => i.section === s.key);
        if (list.length === 0) return null;
        const num = s.key === 'file' ? 3 : s.key === 'training' ? 5 : 6;
        const sDone = list.filter((i) => DONE.includes(i.status)).length;
        return (
          <section key={s.key} className="onb-section">
            {s.key === 'training' && (
              <section className="onb-section">
                <h2>4. Policies to read and sign <span className="muted small">— {polSigned} of {policies?.length ?? 0} signed</span></h2>
                <p className="muted small">Policies are kept in the Policy library. Open each one, read it, and sign it digitally. When a policy is updated you’ll be asked to sign the new version.</p>
                {(policies ?? []).length === 0 && <p className="muted">No policies have been added yet.</p>}
                <ul className="list">
                  {(policies ?? []).map((pol) => {
                    const a = ackFor(pol);
                    return (
                      <li key={pol.id}>
                        <Link href={`/policies/${pol.id}`}>
                          <span><ProgramBadge program={pol.applies_to} /> <strong>{pol.title}</strong> <span className="muted small">v{pol.current?.version_label ?? '—'}{pol.code && ` · ${pol.code}`}</span></span>
                          <span className="small">{a ? <span className="badge">✓ Signed {fmtDateTime(a.signed_at)}</span> : <span className="badge bad">Read and sign</span>}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <h2>{num}. {s.title} <span className="muted small">— {sDone} of {list.length} done</span></h2>
            {s.key === 'file' && <p className="muted small">Items 8 (training certificates) and 14 (signed policies) are the next two sections. Items 9, 10, 12 and 13 (evaluations, discipline, rehire, exit interview) are added during and after employment.</p>}
            {list.map((item) => {
              const tpl = templateFor(item.item_key) ?? { kind: 'manager' };
              const overdue = !DONE.includes(item.status) && item.status !== 'Submitted' && item.due_date && item.due_date < today;
              const open = isSelf ? ['To do', 'Returned'].includes(item.status) : item.status === 'Submitted';
              return (
                <details key={item.id} id={`item-${item.id}`} className={`onb-item s-${item.status.replace(/[^a-z]/gi, '')}`} open={open}>
                  <summary>
                    <span className="onb-title">{tpl.program && <><ProgramBadge program={tpl.program} /> </>}{tpl.no ? `${tpl.no}. ` : ''}{item.title}{tpl.ifApplicable && <span className="muted small"> (if applicable)</span>}</span>
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
