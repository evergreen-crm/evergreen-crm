// One intake: send forms, email the links, track who has signed, print.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { fmtDate, fmtDateTime } from '@/lib/options';
import { siteOrigin } from '@/lib/idcard';
import { emailReady } from '@/lib/email';
import { formsForStream, DEFAULT_PACKAGE, SIGNER_ROLES } from '@/lib/intakeForms';
import ProgramBadge from '@/app/components/ProgramBadge';
import CopyLink from './CopyLink';
import { sendForms, fillInternal, cancelRequest, renewRequest, updateCase } from '../actions';

const badge = { Sent: 'warn', Opened: 'warn', Completed: '', Cancelled: 'bad' };

function mailto(email, name, person, reqs, origin, sender) {
  const lines = reqs.map((r) => `• ${r.form_title}\n  ${origin}/f/${r.token}`).join('\n\n');
  const subject = `Evergreen Community Care — intake form${reqs.length > 1 ? 's' : ''} for ${person}`;
  const body = `Hello ${name},\n\nEvergreen Community Care is completing intake for ${person}. Please open each link below, fill in the form and sign it on your phone or computer. Each link is private to you and works for 21 days. When you open a link, we will email you a 6-digit code to confirm it is you.\n\n${lines}\n\nIf you have documents to share (court orders, plans, health records), please reply to this email with them attached.\n\nThank you,\n${sender}\nEvergreen Community Care`;
  return `mailto:${encodeURIComponent(email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default async function IntakeCase({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const [{ data: c }, { data: reqs }, { data: homes }] = await Promise.all([
    supabase.from('intake_cases').select('*, homes(name)').eq('id', id).maybeSingle(),
    supabase.from('intake_requests').select('id, form_key, form_title, recipient_name, recipient_email, recipient_role, token, status, sent_at, opened_at, completed_at, expires_at, signed_name, signer_role, require_code, verified_at').eq('case_id', id).order('sent_at'),
    supabase.from('homes').select('id, name').order('name'),
  ]);
  if (!c) notFound();
  const origin = await siteOrigin();
  const codesReady = emailReady() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const forms = formsForStream(c.stream);
  const external = forms.filter((f) => !f.internal);
  const suggested = new Set((DEFAULT_PACKAGE[c.stream] ?? []).map((p) => p.key));
  const live = (reqs ?? []).filter((r) => r.status !== 'Cancelled');
  const done = live.filter((r) => r.status === 'Completed').length;

  // Group links by recipient so one email can carry all of their forms.
  const groups = {};
  for (const r of live) {
    const k = `${r.recipient_name}|${r.recipient_email ?? ''}`;
    (groups[k] ??= { name: r.recipient_name, email: r.recipient_email, role: r.recipient_role, items: [] }).items.push(r);
  }
  const now = Date.now();

  return (
    <main>
      <p className="small"><Link href="/intake">← All intakes</Link></p>
      <div className="title-row">
        <h1><ProgramBadge program={c.stream} /> {c.person_name}</h1>
        <span className="badge">{c.status}</span>
      </div>
      <p className="muted">Referred {fmtDate(c.referral_date)}{c.homes?.name && ` · ${c.homes.name}`} · {done} of {live.length} forms signed</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}

      {Object.values(groups).map((g) => {
        const pending = g.items.filter((r) => r.status !== 'Completed');
        return (
          <section key={g.name + g.email} className="card intake-group">
            <div className="title-row">
              <h2>{g.name} <span className="muted small">{g.role}{g.email && ` · ${g.email}`}</span></h2>
              {pending.length > 0 && (
                <a className="button" href={mailto(g.email, g.name, c.person_name, pending, origin, profile.full_name)}>📧 Email {pending.length > 1 ? `${pending.length} links` : 'link'}</a>
              )}
            </div>
            <table>
              <thead><tr><th>Form</th><th>Status</th><th>Sign link</th><th></th></tr></thead>
              <tbody>
                {g.items.map((r) => {
                  const expired = r.status !== 'Completed' && new Date(r.expires_at).getTime() < now;
                  return (
                    <tr key={r.id}>
                      <td>{r.form_title}</td>
                      <td>
                        <span className={`badge ${expired ? 'bad' : badge[r.status]}`}>{expired ? 'Expired' : r.status === 'Completed' ? '✓ Signed' : r.status}</span>
                        <div className="muted small">
                          {r.status === 'Completed' ? `${r.signed_name}${r.signer_role ? ` (${r.signer_role})` : ''} · ${fmtDateTime(r.completed_at)}`
                            : r.verified_at ? `Email code confirmed ${fmtDateTime(r.verified_at)}`
                            : r.opened_at ? `Opened ${fmtDateTime(r.opened_at)}` : `Made ${fmtDateTime(r.sent_at)}`}
                          {r.require_code && r.recipient_email && r.status !== 'Completed' && ' · 🔒 email code'}
                        </div>
                      </td>
                      <td>{r.status === 'Completed'
                        ? <Link href={`/intake/request/${r.id}`}>View / print</Link>
                        : <CopyLink url={`${origin}/f/${r.token}`} />}</td>
                      <td className="small">
                        {r.status !== 'Completed' && (
                          <>
                            <form action={renewRequest} style={{ display: 'inline' }}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="case_id" value={id} /><button className="link small">New link</button></form>{' · '}
                            <form action={cancelRequest} style={{ display: 'inline' }}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="case_id" value={id} /><button className="link small">Cancel</button></form>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}

      <section className="card" id="send">
        <h2>Send forms to someone</h2>
        <form action={sendForms}>
          <input type="hidden" name="case_id" value={id} />
          <div className="row">
            <label>Their name<input name="recipient_name" required /></label>
            <label>Their email<input type="email" name="recipient_email" placeholder="name@gov.bc.ca" /></label>
            <label>They are
              <select name="recipient_role" defaultValue={c.stream === 'MCFD' ? 'MCFD social worker' : 'CLBC facilitator / analyst'}>
                {SIGNER_ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
          </div>
          <label className="check"><input type="checkbox" name="require_code" defaultChecked /> 🔒 Require an email code before they can open the form (recommended)</label>
          {!codesReady && <p className="message small">Email codes need a one-time setup (Resend email key in Vercel). Until then, people with a 🔒 link will see “codes not switched on”. Untick the box above to send links without a code.</p>}
          <p className="small"><strong>Forms to send</strong> <span className="muted">(suggested ones are ticked — untick any that don’t apply to this person)</span></p>
          <div className="intake-forms">
            {external.map((f) => (
              <label key={f.key} className="check">
                <input type="checkbox" name="form" value={f.key} defaultChecked={suggested.has(f.key) && f.signer !== 'Youth' && f.signer !== 'Adult (self)'} />
                <span><strong>{f.title}</strong> <span className="muted small">· usually {f.signer} · {f.code}</span></span>
              </label>
            ))}
          </div>
          <button>Make sign links</button>
          <p className="muted small">After making the links, press <strong>📧 Email</strong> next to the person’s name — it opens your email (Outlook / Gmail) with the message and links ready to send from your own address. Youth / adults can also fill their forms in person on a staff phone using the link.</p>
        </form>
      </section>

      <section className="card">
        <h2>Program Manager</h2>
        <form action={fillInternal}>
          <input type="hidden" name="case_id" value={id} />
          <input type="hidden" name="form" value="admission_decision" />
          <button className="secondary">📝 Fill and sign the Admission Decision Record</button>
        </form>
        <form action={updateCase} className="row" style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={id} />
          <label>Intake status
            <select name="status" defaultValue={c.status}>{['Open', 'Accepted', 'Declined', 'Closed'].map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label>House
            <select name="home_id" defaultValue={c.home_id ?? ''}><option value="">—</option>{homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
          </label>
          <label>Notes<input name="notes" defaultValue={c.notes ?? ''} /></label>
          <button className="secondary">Save</button>
        </form>
      </section>
    </main>
  );
}
