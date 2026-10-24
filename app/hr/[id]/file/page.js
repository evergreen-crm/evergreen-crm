// 🗂 Complete staff file: one staff member's whole record from hiring to exit, ready to print or "Save as PDF"
// (audits, licensing inspections, MCFD screening checks, or a staff member's request for their own file).
// Who: HR, and Program Manager and up. Every time it is opened or printed it is saved in report_prints.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canHR, personLabel } from '@/lib/levels';
import { TZ, fmtDate, todayISO } from '@/lib/options';
import { certStatus } from '@/lib/hr';
import { SECTIONS as PS_SECTIONS, STEPS, CLEARANCE, ITEM_ST, itemsFor, stOf, stepState, clearance, interviewAvg, interviewCount, refsDone, managerConfirmed, INTERVIEW } from '@/lib/prescreen';
import { BADGE, REASONS } from '@/lib/badges';
import NotReady from '@/app/components/NotReady';
import ReportPrintButton from '@/app/reports/daily/ReportPrintButton';

// Date and time with the year (reports can cover more than one year).
const fmtDateTime = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

export const dynamic = 'force-dynamic';

const PARTS = [
  { key: 'details', label: 'Employee details' },
  { key: 'hiring', label: 'Hiring: application, interview, references, criminal record check, clearance' },
  { key: 'offer', label: 'Offer letter' },
  { key: 'onboarding', label: 'Onboarding and orientation (signed handbook, rules, documents)' },
  { key: 'training', label: 'Training and Academy courses' },
  { key: 'certs', label: 'Certificates (First Aid, NVCI, driver’s abstract…) and expiry dates' },
  { key: 'probation', label: 'Probation reviews (30, 90, 120 days) and outcome' },
  { key: 'policies', label: 'Policies signed' },
  { key: 'signed', label: 'Documents sent for signature (letters, agreements…)' },
  { key: 'badges', label: 'Monthly badges, Letters of Expectation and commendations' },
  { key: 'promotions', label: 'Promotions' },
  { key: 'exit', label: 'Exit' },
];
const ST_LABEL = Object.fromEntries(ITEM_ST);
const REASON = Object.fromEntries(REASONS.map((r) => [r.key, r]));
const LETTERS = new Set(['coaching', 'loe1', 'loe2', 'loe3', 'final_warning', 'investigation']);
const ONB_SECTION = { file: 'Documents for the staff file', policy: 'Policies and rules signed in onboarding', training: 'Orientation training' };
const yes = (v) => (v === true ? 'Yes' : v === false ? 'No' : v ?? '—');
const money = (n, unit) => (n == null ? '—' : `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per ${unit ?? 'hour'}`);

function Empty({ children }) { return <p className="muted small">{children}</p>; }

export default async function StaffFile({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!canHR(profile)) redirect('/');

  const { data: person } = await supabase.from('profiles')
    .select('id, full_name, email, phone, role, level, staff_group, active, home_id, created_at, homes(name)').eq('id', id).maybeSingle();
  if (!person) notFound();

  const chosen = sp.go ? new Set(PARTS.map((p) => p.key).filter((k) => sp[k])) : new Set(PARTS.map((p) => p.key));
  const info = { report: 'staff-file', staff_id: person.id, sections: [...chosen] };

  // Record that the file was opened.
  const { error: logErr } = await supabase.from('report_prints').insert({ report: 'staff-file', action: 'opened', staff_id: person.id, sections: [...chosen] });
  const form = (
    <form className="card no-print" method="get">
      <input type="hidden" name="go" value="1" />
      <p className="small" style={{ marginTop: 0 }}><Link href={`/hr/${person.id}`}>← {person.full_name}’s HR record</Link></p>
      <h2 style={{ marginTop: 0 }}>🗂 Complete staff file — {person.full_name}</h2>
      <p className="muted small" style={{ marginTop: 0 }}>Everything from the day they were hired to the day they left. Every file you open or print is recorded.</p>
      <div className="row">
        <div>
          <strong className="small">Include</strong>
          {PARTS.map((p) => <label key={p.key} className="check"><input type="checkbox" name={p.key} value="1" defaultChecked={chosen.has(p.key)} /> {p.label}</label>)}
        </div>
      </div>
      <div className="row" style={{ alignItems: 'center' }}>
        <button className="secondary">Update</button>
        {!logErr && <ReportPrintButton info={info} />}
      </div>
      <p className="muted small">Tip: to make a PDF, choose “Save as PDF” as the printer.</p>
    </form>
  );
  if (logErr) {
    return (
      <main className="report">
        {form}
        {/report_prints|staff_id|relation|schema cache|column/i.test(logErr.message)
          ? <NotReady what="Printing staff files" file="report-prints.sql" />
          : <p className="message error">The file couldn’t be recorded, so it isn’t shown: {logErr.message}</p>}
      </main>
    );
  }

  // ---------- Load everything ----------
  const safe = async (p) => { try { const r = await p; return r.error ? { data: null, error: r.error } : r; } catch (e) { return { data: null, error: e }; } };
  const [
    { data: details }, { data: certs }, { data: trainings }, { data: onb }, { data: onbItems },
    { data: offers }, probR, revR, { data: acks }, badgesR, promosR, prescreenR,
  ] = await Promise.all([
    safe(supabase.from('staff_details').select('*').eq('profile_id', id).maybeSingle()),
    safe(supabase.from('certifications').select('*').eq('profile_id', id).order('cert_type').order('expires_on', { ascending: false })),
    safe(supabase.from('trainings').select('*, verifier:verified_by(full_name)').eq('profile_id', id).order('completed_on')),
    safe(supabase.from('onboardings').select('*, sender:sent_by(full_name), completer:completed_by(full_name)').eq('profile_id', id).maybeSingle()),
    safe(supabase.from('onboarding_items').select('section, title, sort, status, due_date, signed_name, signed_at, review_note, reviewed_at, reviewer:reviewed_by(full_name)').eq('profile_id', id).order('section').order('sort')),
    safe(supabase.from('offer_letters').select('*').eq('profile_id', id).order('created_at')),
    safe(supabase.from('staff_probation').select('*, confirmer:confirmed_by(full_name)').eq('staff_id', id).maybeSingle()),
    safe(supabase.from('probation_reviews').select('*, reviewer:reviewer_id(full_name)').eq('staff_id', id).order('review_day')),
    safe(supabase.from('policy_acks').select('signed_name, signed_at, policies(title, code), policy_versions(version_label)').eq('profile_id', id).order('signed_at')),
    safe(supabase.from('staff_badges').select('*, setter:set_by(full_name)').eq('profile_id', id).order('month')),
    safe(supabase.from('staff_promotions').select('*, recommender:recommended_by(full_name), approver:approved_by(full_name)').eq('staff_id', id).order('created_at')),
    person.email ? safe(supabase.from('prescreens').select('*').ilike('email', person.email.replace(/[\\%_]/g, (m) => '\\' + m)).order('created_at', { ascending: false }).limit(1)) : Promise.resolve({ data: [] }),
  ]);
  const signR = await safe(supabase.from('sign_request_signers')
    .select('id, status, signed_at, signed_name, declined_at, decline_reason, sign_requests(id, title, category, created_at, status, sender:created_by(full_name))')
    .eq('profile_id', id).order('id'));
  const signedDocs = (signR.data ?? []).filter((x) => x.sign_requests).sort((a, b) => a.sign_requests.created_at.localeCompare(b.sign_requests.created_at));
  const prob = probR.data, reviews = revR.data ?? [], badges = badgesR.data ?? [], promos = promosR.data ?? [];
  const ps = prescreenR.data?.[0] ?? null;
  let ladder = {};
  if (promos.length) {
    const { data } = await safe(supabase.from('career_ladder').select('step, title'));
    ladder = Object.fromEntries((data ?? []).map((l) => [l.step, l.title]));
  }
  const today = todayISO();
  const printedAt = fmtDateTime(new Date().toISOString());
  const letters = badges.filter((b) => (b.reasons ?? []).some((r) => LETTERS.has(r)));
  const exitDone = details?.last_day || (details?.employment_status && details.employment_status !== 'Active');

  return (
    <main className="report daily-report">
      <style>{`
        .daily-report .conf { border: 2px solid #b3261e; color: #b3261e; font-weight: 700; padding: 2px 8px; border-radius: 4px; letter-spacing: .05em; }
        .daily-report td, .daily-report th { vertical-align: top; }
        .daily-report .note-text { white-space: pre-wrap; }
        .daily-report .facts2 { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: .9rem; }
        .daily-report .facts2 dt { font-weight: 600; }
        .daily-report .print-foot { display: none; }
        @media print {
          .daily-report .print-foot { display: block; position: fixed; bottom: 0; left: 0; right: 0; font-size: 8pt; color: #555; text-align: center; border-top: 1px solid #ccc; padding-top: 2px; background: #fff; }
          .daily-report { padding-bottom: 24px; }
          .daily-report tr { break-inside: avoid; }
          @page { margin: 14mm 12mm 16mm; }
        }
      `}</style>
      {form}
      <div className="print-foot">CONFIDENTIAL — Evergreen Community Care Inc. · Staff file: {person.full_name} · Printed {printedAt} by {profile.full_name}</div>

      <div className="report-head">
        <img src="/logo.png" alt="Evergreen Community Care" />
        <h1>Complete staff file</h1>
        <span className="conf">CONFIDENTIAL</span>
      </div>
      <dl className="facts2" style={{ marginBottom: 12 }}>
        <dt>Staff member</dt><dd><strong>{person.full_name}</strong>{details?.employee_no ? ` · Employee no. ${details.employee_no}` : ''}</dd>
        <dt>Position</dt><dd>{details?.position ?? '—'}{details?.employment_type ? ` (${details.employment_type})` : ''} · {personLabel(person)}</dd>
        <dt>House</dt><dd>{person.homes?.name ?? '—'}</dd>
        <dt>Hire date</dt><dd>{details?.hire_date ? fmtDate(details.hire_date) : '—'}{details?.last_day ? ` · Last day ${fmtDate(details.last_day)}` : ''}</dd>
        <dt>Status</dt><dd>{details?.employment_status ?? 'Active'}{!person.active ? ' · CRM access turned off' : ''}</dd>
        <dt>Printed</dt><dd>{printedAt} by {profile.full_name}</dd>
      </dl>

      {chosen.has('details') && (
        <section className="card">
          <h2>1. Employee details</h2>
          <dl className="facts2">
            <dt>Email</dt><dd>{person.email ?? '—'}</dd>
            <dt>Phone</dt><dd>{person.phone ?? '—'}</dd>
            <dt>Program</dt><dd>{details?.program ?? 'Both'}</dd>
            <dt>Access level</dt><dd>{personLabel(person)}</dd>
            <dt>Emergency contact</dt><dd>{[details?.emergency_contact, details?.emergency_phone].filter(Boolean).join(' · ') || '—'}</dd>
            {details?.employee_no_previous && <><dt>Previous employee no.</dt><dd>{details.employee_no_previous}</dd></>}
            {details?.notes && <><dt>Notes</dt><dd className="note-text">{details.notes}</dd></>}
          </dl>
        </section>
      )}

      {chosen.has('hiring') && (
        <section className="card page-break">
          <h2>2. Hiring</h2>
          {!ps ? <Empty>No applicant file found for {person.email ?? 'this person'} (or you don’t have access to applicant files).</Empty> : (() => {
            const st = stepState(ps); const cl = CLEARANCE[clearance(ps)]; const avg = interviewAvg(ps);
            const items = itemsFor(ps);
            return (
              <>
                <dl className="facts2">
                  <dt>Applied for</dt><dd>{ps.position ?? '—'} · {ps.worker_type ?? ''} · {ps.program}</dd>
                  <dt>Application signed</dt><dd>{ps.signed_at ? `${fmtDateTime(ps.signed_at)} by ${ps.signed_name ?? ''}` : 'Not signed'}</dd>
                  <dt>Interview</dt><dd>{interviewCount(ps)} of {INTERVIEW.length} questions scored{avg ? ` · average ${avg.toFixed(1)}` : ''}</dd>
                  <dt>References</dt><dd>{refsDone(ps)} of 3 done · {managerConfirmed(ps) ? 'manager / supervisor confirmed' : 'no manager / supervisor confirmed'}</dd>
                  <dt>Clearance</dt><dd><strong>{cl.label}</strong> — {cl.text}</dd>
                  {ps.restrictions && <><dt>Restrictions</dt><dd className="note-text">{ps.restrictions}</dd></>}
                  {ps.file_notes && <><dt>File notes</dt><dd className="note-text">{ps.file_notes}</dd></>}
                </dl>
                <p className="small"><strong>Steps:</strong> {STEPS.filter(([k]) => st[k] !== 'skip').map(([k, l]) => `${st[k] === 'done' ? '✓' : '○'} ${l}`).join(' · ')}</p>
                <table>
                  <thead><tr><th>Check</th><th>Status</th><th>Expires</th><th>Note</th></tr></thead>
                  <tbody>
                    {PS_SECTIONS.map((sec) => {
                      const rows = items.filter((i) => i.sec === sec.n);
                      return rows.length ? [
                        <tr key={'h' + sec.n}><td colSpan={4}><strong className="small">{sec.n}. {sec.t}</strong></td></tr>,
                        ...rows.map((i) => {
                          const v = ps.items?.[i.k] ?? {};
                          return (
                            <tr key={i.k}>
                              <td className="small">{i.l}</td>
                              <td className="small"><span className={`badge ${stOf(ps, i.k) === 'fail' ? 'bad' : stOf(ps, i.k) === 'ok' || stOf(ps, i.k) === 'na' ? '' : 'warn'}`}>{ST_LABEL[stOf(ps, i.k)] ?? stOf(ps, i.k)}</span>{v.at ? <><br /><span className="muted">{fmtDate(String(v.at).slice(0, 10))}</span></> : null}</td>
                              <td className="small">{v.exp ? fmtDate(v.exp) : ''}</td>
                              <td className="small note-text">{v.note ?? ''}</td>
                            </tr>
                          );
                        }),
                      ] : null;
                    })}
                  </tbody>
                </table>
                {['orientation', 'competency', 'independent'].some((k) => ps.post?.[k]?.at) && (
                  <p className="small"><strong>After hiring:</strong> {['orientation', 'competency', 'independent'].map((k) => ps.post?.[k]?.at ? `${k[0].toUpperCase() + k.slice(1)} signed off ${fmtDate(String(ps.post[k].at).slice(0, 10))}` : null).filter(Boolean).join(' · ')}</p>
                )}
              </>
            );
          })()}
        </section>
      )}

      {chosen.has('offer') && (
        <section className="card">
          <h2>3. Offer letter</h2>
          {!(offers ?? []).length ? <Empty>No offer letter in the CRM.</Empty> : (
            <table>
              <thead><tr><th>Position</th><th>Terms</th><th>Status</th><th>Signed</th></tr></thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id}>
                    <td className="small">{o.position}{o.house ? ` · ${o.house}` : ''}{o.reports_to ? <><br /><span className="muted">Reports to {o.reports_to}</span></> : null}</td>
                    <td className="small">{[o.employment_type, o.program, o.hours, money(o.wage, o.wage_unit), o.start_date && `start ${fmtDate(o.start_date)}`].filter(Boolean).join(' · ')}</td>
                    <td className="small"><span className="badge">{o.status}</span>{o.issued_at ? <><br />Sent {fmtDateTime(o.issued_at)}{o.issued_by_name ? ` by ${o.issued_by_name}` : ''}</> : null}</td>
                    <td className="small">{o.accepted_at ? `Accepted ${fmtDateTime(o.accepted_at)} · signed “${o.signed_name ?? ''}”` : o.declined_at ? `Declined ${fmtDateTime(o.declined_at)}${o.decline_reason ? ` — ${o.decline_reason}` : ''}` : o.withdrawn_at ? `Withdrawn ${fmtDateTime(o.withdrawn_at)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {chosen.has('onboarding') && (
        <section className="card page-break">
          <h2>4. Onboarding and orientation</h2>
          {!onb ? <Empty>No onboarding checklist.</Empty> : (
            <>
              <dl className="facts2">
                <dt>Status</dt><dd>{onb.status}</dd>
                <dt>Sent</dt><dd>{fmtDateTime(onb.sent_at)}{onb.sender?.full_name ? ` by ${onb.sender.full_name}` : ''}{onb.due_date ? ` · due ${fmtDate(onb.due_date)}` : ''}</dd>
                <dt>Signed by staff</dt><dd>{onb.signature_at ? fmtDateTime(onb.signature_at) : 'Not yet'}</dd>
                <dt>Submitted</dt><dd>{onb.submitted_at ? fmtDateTime(onb.submitted_at) : '—'}</dd>
                <dt>Completed</dt><dd>{onb.completed_at ? `${fmtDateTime(onb.completed_at)}${onb.completer?.full_name ? ` by ${onb.completer.full_name}` : ''}` : '—'}</dd>
              </dl>
              {onb.signature_image && <p className="small">Staff signature:<br /><img src={onb.signature_image} alt="Signature" style={{ maxHeight: 60, border: '1px solid #ccc', background: '#fff' }} /></p>}
              {['file', 'policy', 'training'].map((sec) => {
                const rows = (onbItems ?? []).filter((i) => i.section === sec);
                return rows.length ? (
                  <div key={sec}>
                    <h3>{ONB_SECTION[sec]}</h3>
                    <table>
                      <thead><tr><th>Item</th><th>Status</th><th>Signed</th><th>Checked by</th></tr></thead>
                      <tbody>
                        {rows.map((i, k) => (
                          <tr key={k}>
                            <td className="small">{i.title}</td>
                            <td className="small"><span className={`badge ${i.status === 'Verified' || i.status === 'N/A' ? '' : i.status === 'Returned' ? 'bad' : 'warn'}`}>{i.status}</span>{i.review_note ? <><br /><span className="muted">{i.review_note}</span></> : null}</td>
                            <td className="small">{i.signed_at ? `${fmtDateTime(i.signed_at)}${i.signed_name ? ` · “${i.signed_name}”` : ''}` : '—'}</td>
                            <td className="small">{i.reviewed_at ? `${i.reviewer?.full_name ?? ''} · ${fmtDateTime(i.reviewed_at)}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null;
              })}
            </>
          )}
        </section>
      )}

      {chosen.has('training') && (
        <section className="card page-break">
          <h2>5. Training and Academy courses</h2>
          {!(trainings ?? []).length ? <Empty>No training recorded.</Empty> : (
            <table>
              <thead><tr><th>Training</th><th>Completed</th><th>Hours</th><th>Provider</th><th>Expires</th><th>Verified</th></tr></thead>
              <tbody>
                {trainings.map((t) => (
                  <tr key={t.id}>
                    <td className="small">{t.title}{t.certificate_no ? <><br /><span className="muted">Certificate {t.certificate_no}</span></> : null}{t.notes ? <><br /><span className="muted note-text">{t.notes}</span></> : null}</td>
                    <td className="small">{fmtDate(t.completed_on)}</td>
                    <td className="small">{t.hours ?? ''}</td>
                    <td className="small">{t.provider ?? ''}</td>
                    <td className="small">{t.expires_on ? <>{fmtDate(t.expires_on)}{t.expires_on < today ? <> <span className="badge bad">Expired</span></> : null}</> : '—'}</td>
                    <td className="small">{t.verified_by ? t.verifier?.full_name ?? 'Yes' : <span className="badge warn">Not verified</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {chosen.has('certs') && (
        <section className="card">
          <h2>6. Certificates and expiry dates</h2>
          {!(certs ?? []).length ? <Empty>No certificates recorded.</Empty> : (
            <table>
              <thead><tr><th>Certificate</th><th>Issued</th><th>Expires</th><th>Status</th><th>Notes</th></tr></thead>
              <tbody>
                {certs.map((c) => {
                  const s = certStatus(c.expires_on);
                  return (
                    <tr key={c.id}>
                      <td className="small">{c.cert_type}</td>
                      <td className="small">{c.issued_on ? fmtDate(c.issued_on) : '—'}</td>
                      <td className="small">{c.expires_on ? fmtDate(c.expires_on) : '—'}</td>
                      <td className="small"><span className={`badge ${s.key === 'expired' ? 'bad' : s.key === 'soon' ? 'warn' : ''}`}>{s.key === 'ok' ? 'Current' : s.label}</span></td>
                      <td className="small note-text">{c.notes ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="muted small">Older certificates are kept, so renewals show as separate rows.</p>
        </section>
      )}

      {chosen.has('probation') && (
        <section className="card page-break">
          <h2>7. Probation</h2>
          {probR.error && /staff_probation|relation|schema cache/i.test(probR.error.message ?? '') ? <Empty>Probation reviews aren’t switched on yet.</Empty>
            : !prob ? <Empty>No probation record.</Empty> : (
              <>
                <dl className="facts2">
                  <dt>Position</dt><dd>{prob.position ?? '—'}</dd>
                  <dt>Started</dt><dd>{fmtDate(prob.hire_date)}</dd>
                  <dt>Outcome</dt><dd><strong>{prob.status}</strong>{prob.confirmed_on ? ` · ${fmtDate(prob.confirmed_on)}` : ''}{prob.confirmer?.full_name ? ` by ${prob.confirmer.full_name}` : ''}</dd>
                </dl>
                {reviews.map((r) => (
                  <div key={r.id} style={{ breakInside: 'avoid', marginTop: 8 }}>
                    <h3 style={{ margin: '8px 0 4px' }}>{r.review_day}-day review — {r.completed_on ? `done ${fmtDate(r.completed_on)}` : `due ${fmtDate(r.due_date)} (not done)`}</h3>
                    <dl className="facts2">
                      <dt>Reviewer</dt><dd>{r.reviewer?.full_name ?? '—'}</dd>
                      <dt>Rating</dt><dd>{r.rating ?? '—'}</dd>
                      {r.strengths && <><dt>Strengths</dt><dd className="note-text">{r.strengths}</dd></>}
                      {r.areas_to_improve && <><dt>To improve</dt><dd className="note-text">{r.areas_to_improve}</dd></>}
                      {r.goals_next_period && <><dt>Goals</dt><dd className="note-text">{r.goals_next_period}</dd></>}
                      {r.final_decision && <><dt>Decision</dt><dd><strong>{r.final_decision}</strong></dd></>}
                      <dt>Staff acknowledged</dt><dd>{yes(r.staff_acknowledged)}</dd>
                    </dl>
                  </div>
                ))}
              </>
            )}
        </section>
      )}

      {chosen.has('policies') && (
        <section className="card">
          <h2>8. Policies signed</h2>
          {!(acks ?? []).length ? <Empty>No policy signatures.</Empty> : (
            <table>
              <thead><tr><th>Policy</th><th>Version</th><th>Signed</th><th>Signed as</th></tr></thead>
              <tbody>
                {acks.map((a, k) => (
                  <tr key={k}>
                    <td className="small">{a.policies?.title ?? '—'}{a.policies?.code ? <><br /><span className="muted">{a.policies.code}</span></> : null}</td>
                    <td className="small">{a.policy_versions?.version_label ?? ''}</td>
                    <td className="small">{fmtDateTime(a.signed_at)}</td>
                    <td className="small">“{a.signed_name}”</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {chosen.has('signed') && (
        <section className="card">
          <h2>8b. Documents sent for signature</h2>
          {signR.error ? <Empty>Sending documents for signature isn’t switched on yet.</Empty> : !signedDocs.length ? <Empty>No documents sent to this person for signature.</Empty> : (
            <table>
              <thead><tr><th>Document</th><th>Sent</th><th>Answer</th></tr></thead>
              <tbody>
                {signedDocs.map((d) => (
                  <tr key={d.id}>
                    <td className="small">{d.sign_requests.title}<br /><span className="muted">{d.sign_requests.category}</span></td>
                    <td className="small">{fmtDateTime(d.sign_requests.created_at)}{d.sign_requests.sender?.full_name ? <><br />by {d.sign_requests.sender.full_name}</> : null}</td>
                    <td className="small">{d.status === 'Signed' ? `Signed ${fmtDateTime(d.signed_at)} as “${d.signed_name}”` : d.status === 'Declined' ? `Declined ${fmtDateTime(d.declined_at)}: ${d.decline_reason ?? ''}` : d.sign_requests.status === 'Cancelled' ? 'Request cancelled' : 'Not signed yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {chosen.has('badges') && (
        <section className="card page-break">
          <h2>9. Monthly badges, letters and commendations</h2>
          {letters.length > 0 && (
            <p className="message error small"><strong>Letters and warnings on file:</strong> {letters.map((b) => `${(b.reasons ?? []).filter((r) => LETTERS.has(r)).map((r) => REASON[r]?.label ?? r).join(', ')} (${new Date(b.month + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' })})`).join(' · ')}</p>
          )}
          {badgesR.error ? <Empty>Badges aren’t switched on yet, or you can’t see them.</Empty> : !badges.length ? <Empty>No monthly badges yet.</Empty> : (
            <table>
              <thead><tr><th>Month</th><th>Badge</th><th>Why</th><th>Set by</th><th>Staff saw it</th></tr></thead>
              <tbody>
                {badges.map((b) => (
                  <tr key={b.id}>
                    <td className="small">{new Date(b.month + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</td>
                    <td className="small">{BADGE[b.color]?.icon} {BADGE[b.color]?.label ?? b.color}{b.restart ? <><br /><span className="muted">Bonus count restarted</span></> : null}</td>
                    <td className="small">{(b.reasons ?? []).map((r) => REASON[r]?.label ?? r).join('; ') || '—'}{b.note ? <><br /><span className="note-text">{b.note}</span></> : null}</td>
                    <td className="small">{b.setter?.full_name ?? '—'}</td>
                    <td className="small">{b.acknowledged_at ? fmtDateTime(b.acknowledged_at) : 'Not yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {chosen.has('promotions') && (
        <section className="card">
          <h2>10. Promotions</h2>
          {promosR.error ? <Empty>Promotions aren’t switched on yet, or you can’t see them.</Empty> : !promos.length ? <Empty>No promotion requests.</Empty> : (
            <table>
              <thead><tr><th>Requested</th><th>From → to</th><th>Status</th><th>Recommended / approved</th></tr></thead>
              <tbody>
                {promos.map((p) => (
                  <tr key={p.id}>
                    <td className="small">{fmtDateTime(p.created_at)}</td>
                    <td className="small">{p.from_step ? ladder[p.from_step] ?? `Step ${p.from_step}` : '—'} → {ladder[p.to_step] ?? `Step ${p.to_step}`}{p.evidence ? <><br /><span className="muted note-text">{p.evidence}</span></> : null}</td>
                    <td className="small"><span className="badge">{p.status}</span>{p.decided_on ? <><br />{fmtDate(p.decided_on)}</> : null}</td>
                    <td className="small">{[p.recommender?.full_name && `Recommended by ${p.recommender.full_name}`, p.approver?.full_name && `Approved by ${p.approver.full_name}`].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {chosen.has('exit') && (
        <section className="card">
          <h2>11. Exit</h2>
          {!exitDone ? <Empty>Still working at Evergreen.</Empty> : (
            <dl className="facts2">
              <dt>Status</dt><dd>{details?.employment_status ?? '—'}</dd>
              <dt>Notice given</dt><dd>{details?.resignation_date ? fmtDate(details.resignation_date) : '—'}</dd>
              <dt>Last day</dt><dd>{details?.last_day ? fmtDate(details.last_day) : '—'}</dd>
              <dt>Reason</dt><dd className="note-text">{details?.separation_reason ?? '—'}</dd>
              <dt>Eligible for rehire</dt><dd>{details?.rehire_eligible ?? '—'}</dd>
              <dt>Exit interview</dt><dd>{details?.exit_interview_on ? fmtDate(details.exit_interview_on) : '—'}</dd>
            </dl>
          )}
        </section>
      )}

      <section className="card" style={{ breakInside: 'avoid' }}>
        <h2>Review and sign-off</h2>
        <table>
          <tbody>
            <tr><td style={{ width: '30%' }}>Reviewed by (name)</td><td>&nbsp;</td></tr>
            <tr><td>Position</td><td>&nbsp;</td></tr>
            <tr><td>Signature</td><td>&nbsp;</td></tr>
            <tr><td>Date</td><td>&nbsp;</td></tr>
            <tr><td>Given to (name, agency) and why</td><td>&nbsp;</td></tr>
          </tbody>
        </table>
        <p className="muted small">This file contains personal information protected under BC privacy law. Share it only with people who are allowed to see it, and only what they need.</p>
      </section>

      <p className="no-print" style={{ marginTop: 16 }}><ReportPrintButton info={info} /></p>
    </main>
  );
}
