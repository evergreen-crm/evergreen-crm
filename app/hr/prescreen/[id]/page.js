// One applicant's digital screening file: link, checklist, application, interview, references, clearance.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePrescreen } from '@/lib/prescreenAuth';
import { fmtDate, fmtDateTime } from '@/lib/options';
import { siteOrigin } from '@/lib/idcard';
import { emailReady } from '@/lib/email';
import ProgramBadge from '@/app/components/ProgramBadge';
import CopyLink from '@/app/intake/[id]/CopyLink';
import {
  SECTIONS, STEPS, POST, INTERVIEW, REFQ, ITEM_ST, TAG_LABEL, CLEARANCE, PROGRAMS, WORKER_TYPES, SELF,
  applies, stOf, stepState, currentStep, clearance, outstanding, renewals, interviewCount, interviewAvg, refsDone, managerConfirmed, daysUntil,
} from '@/lib/prescreen';
import {
  renewLink, cancelLink, openInPerson, saveProfile, saveChecklist, saveInterview, saveReference, signOffPost, saveFileStatus, deletePrescreen,
} from '../actions';

export const metadata = { title: 'Screening file · Evergreen' };

function mailto(p, url, sender) {
  const subject = 'Evergreen Community Care — employment prescreen';
  const body = `Hello ${p.first_name},\n\nThank you for your interest in working with Evergreen Community Care. Please open the private link below to complete your employment prescreen. You'll type your experience, list three work references (one must be a manager or supervisor) and sign at the end. It takes about 15 minutes and works on a phone or computer.\n\n${url}\n\n${p.require_code ? 'When you open the link we will email you a 6-digit code to confirm it is you. ' : ''}The link works for 30 days.\n\nThank you,\n${sender}\nEvergreen Community Care`;
  return `mailto:${encodeURIComponent(p.email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const Hidden = ({ id }) => <input type="hidden" name="id" value={id} />;

export default async function PrescreenFile({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile, prescreenRole } = await requirePrescreen();
  const { data: p } = await supabase.from('prescreens').select('*').eq('id', id).maybeSingle();
  if (!p) notFound();

  const submitted = p.link_status === 'Submitted';
  const canHr = prescreenRole === 'admin' || prescreenRole === 'hr';
  const tabs = [['link', 'Applicant link'], ['checklist', 'Screening checklist'], ['application', 'Application'], ['interview', 'Interview'], ['references', 'References'], ['clearance', 'Clearance']];
  const tab = tabs.some(([k]) => k === sp.tab) ? sp.tab : submitted ? 'checklist' : 'link';
  const st = stepState(p);
  const cur = currentStep(p)[0];
  const clr = submitted ? clearance(p) : null;

  return (
    <main>
      <p className="small no-print"><Link href="/hr/prescreen">← All screening files</Link></p>
      <div className="title-row">
        <h1>{p.first_name} {p.last_name} <ProgramBadge program={p.program} /></h1>
        {clr ? <span className={`ps-clr ps-${clr}`}>{CLEARANCE[clr].label}</span> : <span className="badge warn">Waiting for applicant</span>}
      </div>
      <p className="muted">{p.position ?? 'Position not chosen'} · {p.worker_type ?? 'Employee'}{submitted && ` · signed ${fmtDateTime(p.signed_at)}`}{p.file_status !== 'Open' && ` · ${p.file_status}`}</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}

      <ol className="ps-steps">
        {STEPS.map(([k, l], i) => (
          <li key={k} className={st[k] === 'done' ? 'done' : st[k] === 'skip' ? 'skip' : k === cur ? 'cur' : ''} title={st[k] === 'skip' ? 'Not required for this person' : ''}>
            <i>{st[k] === 'done' ? '✓' : st[k] === 'skip' ? '–' : i + 1}</i><span>{l}</span>
          </li>
        ))}
      </ol>

      <nav className="tabs-bar no-print">
        {tabs.map(([k, l]) => <Link key={k} href={`/hr/prescreen/${id}?tab=${k}`} className={tab === k ? 'on' : ''}>{l}</Link>)}
      </nav>

      {tab === 'link' && <LinkTab p={p} canHr={canHr} sender={profile.full_name} />}
      {tab === 'checklist' && <ChecklistTab p={p} role={prescreenRole} canHr={canHr} />}
      {tab === 'application' && <ApplicationTab p={p} />}
      {tab === 'interview' && <InterviewTab p={p} />}
      {tab === 'references' && <ReferencesTab p={p} />}
      {tab === 'clearance' && <ClearanceTab p={p} clr={clr ?? 'yellow'} canHr={canHr} />}
    </main>
  );
}

async function LinkTab({ p, canHr, sender }) {
  const url = `${await siteOrigin()}/f/prescreen/${p.token}`;
  const expired = !['Submitted', 'Cancelled'].includes(p.link_status) && daysUntil(p.expires_at?.slice(0, 10)) < 0;
  const codesReady = emailReady() && !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (p.link_status === 'Submitted') return (
    <section className="card"><h2>✓ Prescreen signed</h2>
      <p>{p.signed_name} signed on {fmtDateTime(p.signed_at)}. See the <Link href={`/hr/prescreen/${p.id}?tab=application`}>Application</Link> tab.</p></section>
  );
  return (
    <section className="card">
      <h2>Send the private link</h2>
      <p>Status: <span className={`badge ${expired || p.link_status === 'Cancelled' ? 'bad' : 'warn'}`}>{expired ? 'Expired' : p.link_status}</span>
        {p.opened_at && <span className="muted small"> · opened {fmtDateTime(p.opened_at)}</span>}
        {p.verified_at && <span className="muted small"> · email code confirmed {fmtDateTime(p.verified_at)}</span>}
        <span className="muted small"> · works until {fmtDate(p.expires_at?.slice(0, 10))}</span>
        {p.require_code && p.email && ' · 🔒 email code'}</p>
      {p.link_status !== 'Cancelled' && !expired && (
        <div className="row" style={{ alignItems: 'center' }}>
          {p.email && <a className="button" href={mailto(p, url, sender)}>📧 Email the link to {p.email}</a>}
          <CopyLink url={url} />
        </div>
      )}
      {p.require_code && p.email && !codesReady && <p className="message small">Email codes need the Resend key in Vercel. Until then, use “Open on this device” or make the prescreen without a code.</p>}
      {canHr && (
        <div className="row" style={{ marginTop: 12 }}>
          {p.link_status !== 'Cancelled' && !expired && (
            <form action={openInPerson}><Hidden id={p.id} /><button className="secondary">📱 Applicant is here: open on this device</button></form>
          )}
          <form action={renewLink}><Hidden id={p.id} /><button className="secondary">New link</button></form>
          {p.link_status !== 'Cancelled' && <form action={cancelLink}><Hidden id={p.id} /><button className="link small">Cancel link</button></form>}
        </div>
      )}
      <p className="muted small">“Open on this device” turns off the email code for this link, so only use it when the applicant is with you. Hand them the phone or tablet; when they sign, the file appears here.</p>
    </section>
  );
}

function ChecklistTab({ p, role, canHr }) {
  const items = p.items ?? {};
  const a = p.application ?? {};
  const self = (k) => { const v = a.self?.[k]; return v?.has ? `Applicant says: ${{ yes: 'has it', progress: 'in progress', no: 'doesn’t have it' }[v.has] ?? v.has}${v.exp ? ` (expires ${fmtDate(v.exp)})` : ''}` : null; };
  const hint = {
    app: submitted(p) ? 'Signed prescreen on file' : 'Not signed yet',
    interview: `${interviewCount(p)} of ${INTERVIEW.length} questions scored (Interview tab)`,
    coi: a.screen?.coi ? `Applicant declared: ${a.screen.coi === 'yes' ? 'yes — ' + (a.screen.coiDetail ?? '') : 'no conflict'}` : null,
    refs3: `${refsDone(p)} of 3 checks complete${managerConfirmed(p) ? ', manager confirmed' : ', no manager confirmed yet'} (References tab)`,
    t_firstaid: self('firstaid'), t_deesc: self('crisis'), t_meds: self('meds'), t_whmis: self('whmis'), licence: self('licence'), eduv: self('edu'), crc: self('crc'),
    dob: a.applicant?.dob ? `Applicant entered ${fmtDate(a.applicant.dob)}` : null,
  };
  const locked = (it) => (role === 'interviewer' && ![2, 3].includes(it.sec)) || (it.k === 'exec' && role !== 'admin');
  return (
    <>
      <form action={saveProfile} className="card">
        <Hidden id={p.id} />
        <h2>Screening profile</h2>
        <p className="muted small">This decides which program-specific items appear in the checklist below.</p>
        <div className="row">
          <label>Works with<select name="program" defaultValue={p.program} disabled={!canHr}>{PROGRAMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>Role type<select name="worker_type" defaultValue={p.worker_type ?? 'Employee'} disabled={!canHr}>{WORKER_TYPES.map((w) => <option key={w}>{w}</option>)}</select></label>
        </div>
        <label className="check"><input type="checkbox" name="drives" defaultChecked={p.drives} disabled={!canHr} /> Drives for work / transports residents</label>
        <label className="check"><input type="checkbox" name="gives_meds" defaultChecked={p.gives_meds} disabled={!canHr} /> Administers medication</label>
        <label className="check"><input type="checkbox" name="lived_outside" defaultChecked={p.lived_outside} disabled={!canHr} /> Lived outside BC (out-of-jurisdiction checks){a.screen?.where && <span className="muted small"> · applicant: {a.screen.where}</span>}</label>
        {canHr && <button className="secondary">Save profile</button>}
      </form>

      <form action={saveChecklist}>
        <Hidden id={p.id} />
        {SECTIONS.map((s) => {
          const its = s.items.filter((i) => applies(i, p));
          if (!its.length) return <section key={s.n} className="card"><h2>{s.n}. {s.t}</h2><p className="muted">Not required for this person.</p></section>;
          const doneN = its.filter((i) => ['ok', 'na'].includes(stOf(p, i.k))).length;
          return (
            <section key={s.n} className="card">
              <div className="title-row"><h2>{s.n}. {s.t}</h2><span className="muted small">{doneN} of {its.length} done</span></div>
              <table className="ps-items">
                <thead><tr><th>Item</th><th>Status</th><th>{its.some((i) => i.exp) ? 'Expiry / renewal' : ''}</th><th>Note</th></tr></thead>
                <tbody>
                  {its.map((it) => {
                    const v = items[it.k] ?? {}; const s2 = v.st ?? 'todo'; const dis = locked(it); const d = daysUntil(v.exp);
                    return (
                      <tr key={it.k} className={`ps-row ps-st-${s2}`}>
                        <td>{it.l} {it.tag !== 'all' && <span className={`ps-tag ps-tag-${it.tag}`}>{TAG_LABEL[it.tag]}</span>}
                          {hint[it.k] && <div className="muted small">{hint[it.k]}</div>}
                          {v.by_name && s2 !== 'todo' && <div className="muted small">{v.by_name} · {fmtDateTime(v.at)}</div>}</td>
                        <td>
                          <select name={dis ? undefined : `st_${it.k}`} defaultValue={s2} disabled={dis}>{ITEM_ST.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                        </td>
                        <td>{it.exp && <>
                          <input type="date" name={dis ? undefined : `exp_${it.k}`} defaultValue={v.exp ?? ''} disabled={dis} />
                          {v.exp && d <= 60 && <div><span className={`badge ${d < 0 ? 'bad' : 'warn'}`}>{d < 0 ? 'Expired' : `${d} days left`}</span></div>}
                        </>}</td>
                        <td><input name={dis ? undefined : `note_${it.k}`} defaultValue={v.note ?? ''} disabled={dis}
                          placeholder={it.k === 'govid' ? "e.g. BC Driver's Licence sighted" : 'Note'} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
        <div className="ps-savebar no-print"><button>Save checklist</button><span className="muted small">Saves every section on this page.</span></div>
      </form>
    </>
  );
}
const submitted = (p) => p.link_status === 'Submitted';

function ApplicationTab({ p }) {
  const a = p.application;
  if (!a) return <section className="card"><p className="muted">The applicant hasn’t signed the prescreen yet. Send the link from the <Link href={`/hr/prescreen/${p.id}?tab=link`}>Applicant link</Link> tab.</p></section>;
  const ap = a.applicant ?? {}, sc = a.screen ?? {}, ex = a.experience ?? {};
  const prog = PROGRAMS.find(([k]) => k === ap.program)?.[1];
  const KV = ({ rows }) => <dl className="ps-kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || <span className="muted">—</span>}</dd></div>)}</dl>;
  return (
    <>
      <section className="card"><h2>Identification & contact</h2>
        <KV rows={[['Name', `${ap.first} ${ap.last}`], ['Date of birth', ap.dob && fmtDate(ap.dob)], ['Address', ap.address], ['Phone', ap.phone], ['Email', ap.email],
          ['Position', ap.position], ['Applying as', ap.type], ['Will work with', prog], ['Earliest start', ap.start && fmtDate(ap.start)], ['Shifts', (ap.avail ?? []).join(', ')]]} />
      </section>
      <section className="card"><h2>Screening answers</h2>
        <KV rows={[['Drives for work', sc.drive], ['Lived outside BC (10 years)', [sc.outside, sc.where].filter(Boolean).join(' — ')], ['Conflict of interest', [sc.coi, sc.coiDetail].filter(Boolean).join(' — ')]]} />
      </section>
      <section className="card"><h2>Experience</h2>
        <KV rows={[['Years in care', ex.years], ['People supported', (ex.pops ?? []).join(', ')]]} />
        <h3>In their own words</h3><p className="ps-pre">{ex.summary}</p>
        {(ex.roles ?? []).filter((r) => r.employer || r.title).map((r, i) => (
          <div key={i}><strong>{r.title}</strong> · {r.employer} <span className="muted small">{r.from} – {r.to || 'present'}</span><p className="ps-pre">{r.duties}</p></div>
        ))}
        {ex.other && <><h3>Other notes</h3><p className="ps-pre">{ex.other}</p></>}
      </section>
      <section className="card"><h2>Certificates (self-reported)</h2>
        <KV rows={SELF.map((s) => { const v = a.self?.[s.k] ?? {}; return [s.l, v.has ? `${{ yes: 'Yes', progress: 'In progress', no: 'No' }[v.has] ?? v.has}${v.exp ? ` · expires ${fmtDate(v.exp)}` : ''}` : '']; })} />
      </section>
      <section className="card"><h2>References given</h2>
        {(a.refs ?? []).map((r, i) => (
          <p key={i}><strong>{i + 1}. {r.name}</strong> {r.rel === 'Manager / supervisor' && <span className="badge">Manager</span>}<br />
            <span className="small">{r.title} · {r.org} · {r.rel}{r.years && ` · known ${r.years}`}</span><br /><span className="small">{r.phone} {r.email}</span></p>
        ))}
      </section>
      <section className="card"><h2>Declaration & signature</h2>
        <KV rows={[['Information is true', a.consent?.truthful ? 'Yes' : 'No'], ['Consents to verification', a.consent?.verify ? 'Yes' : 'No'],
          ['Accepts screening requirements', a.consent?.screening ? 'Yes' : 'No'], ['Signed by', p.signed_name], ['Signed', fmtDateTime(p.signed_at)], ['Device', p.signer_ip]]} />
        {p.signature && <div className="sig-show"><img src={p.signature} alt={`Signature of ${p.signed_name}`} /></div>}
        <p className="muted small">The signed application is locked and can’t be edited.</p>
      </section>
    </>
  );
}

function InterviewTab({ p }) {
  const iv = p.interview ?? {};
  const avg = interviewAvg(p);
  return (
    <form action={saveInterview} className="card">
      <Hidden id={p.id} />
      <div className="title-row"><h2>Structured interview</h2><span className="muted">{avg ? `Average ${avg.toFixed(1)} / 5` : 'Not scored yet'} · {interviewCount(p)} of {INTERVIEW.length} scored</span></div>
      <div className="row">
        <label>Interview date<input type="date" name="date" defaultValue={iv.date ?? new Date().toISOString().slice(0, 10)} /></label>
        <label>Format<select name="format" defaultValue={iv.format ?? 'In person'}>{['In person', 'Phone', 'Video'].map((x) => <option key={x}>{x}</option>)}</select></label>
        {iv.by_name && <p className="small">Interviewer: <strong>{iv.by_name}</strong></p>}
      </div>
      <p className="muted small">Score each answer 1 (poor) to 5 (excellent). When all {INTERVIEW.length} are scored, mark the interview items Verified on the checklist.</p>
      <ol className="ps-questions">
        {INTERVIEW.map((q, i) => {
          const k = `q${i + 1}`;
          return (
            <li key={k}>
              <strong>{q}</strong>
              <div className="ps-score">{[1, 2, 3, 4, 5].map((n) => (
                <label key={n}><input type="radio" name={`score_${k}`} value={n} defaultChecked={Number(iv.scores?.[k]) === n} /><span>{n}</span></label>
              ))}</div>
              <textarea name={`note_${k}`} rows={2} defaultValue={iv.notes?.[k] ?? ''} placeholder="Notes" />
            </li>
          );
        })}
      </ol>
      <label>Overall impression & suitability<textarea name="overall" rows={3} defaultValue={iv.overall ?? ''} /></label>
      <button>Save interview</button>
    </form>
  );
}

function ReferencesTab({ p }) {
  const given = p.application?.refs ?? [{}, {}, {}];
  return (
    <>
      {!managerConfirmed(p) && <p className="message">No completed check confirms a manager or supervisor yet. At least one reference must have directly supervised the person.</p>}
      {[0, 1, 2].map((i) => {
        const r = given[i] ?? {}; const c = p.ref_checks?.[i] ?? {};
        return (
          <form key={i} action={saveReference} className="card">
            <Hidden id={p.id} /><input type="hidden" name="idx" value={i} />
            <div className="title-row">
              <h2>Reference {i + 1}: {r.name || 'not given yet'} {r.rel === 'Manager / supervisor' && <span className="badge">Manager</span>}</h2>
              <span className={`badge ${c.done ? '' : 'warn'}`}>{c.done ? `✓ Checked${c.by_name ? ` by ${c.by_name}` : ''}` : 'Not checked'}</span>
            </div>
            <p className="small">{r.title} · {r.org} · {r.rel} · <strong>{r.phone}</strong> {r.email}</p>
            <div className="row">
              <label>Date contacted<input type="date" name="date" defaultValue={c.date ?? ''} /></label>
              <label>Method<select name="method" defaultValue={c.method ?? 'Phone'}>{['Phone', 'Email', 'Video'].map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>Would they rehire?<select name="rehire" defaultValue={c.rehire ?? ''}><option value="">Choose…</option>{['Yes', 'No', 'Unsure / policy'].map((x) => <option key={x}>{x}</option>)}</select></label>
            </div>
            <label className="check"><input type="checkbox" name="mgr" defaultChecked={!!c.mgr} /> Reference confirms they directly managed or supervised the person</label>
            <label className="check"><input type="checkbox" name="empv" defaultChecked={!!c.empv} /> Employment dates and position verified</label>
            {REFQ.map((q, j) => <label key={j}>{q}<textarea name={`a_${j}`} rows={2} defaultValue={c.answers?.[j] ?? ''} /></label>)}
            <label className="check"><input type="checkbox" name="done" defaultChecked={!!c.done} /> Reference check complete</label>
            <button>Save reference {i + 1}</button>
          </form>
        );
      })}
    </>
  );
}

function ClearanceTab({ p, clr, canHr }) {
  const out = outstanding(p);
  const ren = renewals(p);
  const failed = SECTIONS.flatMap((s) => s.items).filter((i) => applies(i, p) && stOf(p, i.k) === 'fail');
  return (
    <>
      <section className={`ps-banner ps-${clr}`}>
        <strong>{CLEARANCE[clr].label}</strong><span>{CLEARANCE[clr].text}</span>
        {failed.length > 0 && <span><b>Unsuccessful:</b> {failed.map((i) => i.l).join('; ')}</span>}
      </section>

      <section className="card"><h2>Outstanding items ({out.length})</h2>
        {out.length ? <ul>{out.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted">Nothing outstanding.</p>}</section>

      <section className="card"><h2>After clearance</h2>
        <p className="muted small">Orientation, competency and independent work can only be signed off once the person is GREEN – CLEARED.</p>
        <ul className="checklist">
          {POST.map((k) => {
            const s = p.post?.[k]; const label = STEPS.find(([x]) => x === k)[1];
            return (
              <li key={k} className={s ? 'done' : ''}>
                <span className="req-text"><span className="tick">{s ? '✓' : ''}</span><span><strong>{label}</strong>{s && <span className="muted small"> · {s.by_name} · {fmtDateTime(s.at)}</span>}</span></span>
                {canHr && (
                  <form action={signOffPost}><Hidden id={p.id} /><input type="hidden" name="key" value={k} />
                    {s ? <><input type="hidden" name="undo" value="1" /><button className="link small">Undo</button></>
                      : <button className="secondary" disabled={clr !== 'green'}>Sign off</button>}
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card"><h2>Renewal & expiry dates</h2>
        {ren.length ? <table><tbody>{ren.map((r) => (
          <tr key={r.k}><td>{r.l}</td><td>{fmtDate(r.exp)}</td><td>{r.days < 0 ? <span className="badge bad">Expired</span> : r.days <= 60 ? <span className="badge warn">{r.days} days</span> : ''}</td></tr>
        ))}</tbody></table> : <p className="muted">Add expiry dates on the checklist to track renewals.</p>}
      </section>

      {canHr && (
        <form action={saveFileStatus} className="card">
          <Hidden id={p.id} />
          <h2>Restrictions & file status</h2>
          <label>Duty restrictions while conditional (YELLOW)<textarea name="restrictions" rows={2} defaultValue={p.restrictions ?? ''} placeholder="e.g. Shadow shifts only; no lone work; no medication administration; no driving residents" /></label>
          <div className="row">
            <label>File status<select name="file_status" defaultValue={p.file_status}>{['Open', 'On hold', 'Not moving forward'].map((s) => <option key={s}>{s}</option>)}</select></label>
          </div>
          <label>Notes<textarea name="file_notes" rows={2} defaultValue={p.file_notes ?? ''} /></label>
          <button className="secondary">Save</button>
        </form>
      )}
      {!canHr && p.restrictions && <section className="card"><h2>Duty restrictions</h2><p className="ps-pre">{p.restrictions}</p></section>}

      {canHr && (
        <form action={deletePrescreen} className="card no-print">
          <Hidden id={p.id} />
          <h2>Delete screening file</h2>
          <label className="check"><input type="checkbox" name="confirm" /> I understand this permanently removes {p.first_name}’s application, interview and reference notes.</label>
          <button className="secondary">Delete</button>
        </form>
      )}
    </>
  );
}
