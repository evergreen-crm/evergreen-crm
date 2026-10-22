// ❓ Help: common questions, ask for help, my questions, and (leaders) questions to answer. Step 8.
// Administrators also see whether alert emails are going out (Step 7).
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDateTime } from '@/lib/options';
import { plainError } from '@/lib/plain';
import { FAQ, HELP_TOPICS, PAGE_HELP } from '@/lib/help';
import { emailReady } from '@/lib/email';
import { adminKey, createAdminClient } from '@/lib/supabase/admin';
import NotReady from '@/app/components/NotReady';
import { askHelpForm, answerHelp, testEmail } from './actions';

const badge = (st) => (st === 'Open' ? 'warn' : st === 'Answered' ? '' : 'muted');

export default async function Help({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  const lead = lvl >= 2 || profile.role === 'admin';
  const isAdmin = profile.role === 'admin';

  const { data: reqs, error } = await supabase.from('help_requests')
    .select('*, asker:profile_id(full_name), homes(name), answerer:answered_by(full_name)')
    .order('created_at', { ascending: false }).limit(150);
  const notReady = error && /does not exist|schema cache/i.test(error.message);
  const all = reqs ?? [];
  const mine = all.filter((r) => r.profile_id === user.id);
  const toAnswer = all.filter((r) => r.profile_id !== user.id && r.status === 'Open');
  const answered = all.filter((r) => r.profile_id !== user.id && r.status !== 'Open').slice(0, 15);

  // Email status for administrators (counts and errors only — no alert content).
  let mail = null;
  if (isAdmin && adminKey()) {
    try {
      const admin = createAdminClient();
      const day = new Date(Date.now() - 864e5).toISOString();
      const [sent, waiting, errs] = await Promise.all([
        admin.from('notifications').select('id', { count: 'exact', head: true }).gte('emailed_at', day).like('email_note', 'sent%'),
        admin.from('notifications').select('id', { count: 'exact', head: true }).is('emailed_at', null).gte('created_at', new Date(Date.now() - 3 * 864e5).toISOString()),
        admin.from('notifications').select('email_note, emailed_at, profiles(full_name)').like('email_note', 'error%').gte('emailed_at', new Date(Date.now() - 3 * 864e5).toISOString()).order('emailed_at', { ascending: false }).limit(5),
      ]);
      mail = sent.error ? { notReady: true } : { sent: sent.count ?? 0, waiting: waiting.count ?? 0, errors: errs.data ?? [] };
    } catch { mail = null; }
  }

  return (
    <main>
      <div className="div-banner">
        <span className="div-icon">❓</span>
        <div><h1>Help</h1><p>Common questions, ask for help, and the answers to your questions.</p></div>
      </div>
      {sp?.ok && <p className="message ok">{sp.ok}</p>}
      {sp?.error && <p className="message error">{plainError(sp.error)}</p>}
      <p className="small">🆘 <strong>Emergency?</strong> Call 911 if anyone is in danger, then use the 🆘 button. Don’t use this page for emergencies.</p>

      {lead && !notReady && (
        <section className={`card${toAnswer.length ? ' rh-urgent' : ''}`} id="answer">
          <h2 style={{ marginTop: 0 }}>Questions to answer {toAnswer.length > 0 && <span className="badge warn">{toAnswer.length}</span>}</h2>
          {!toAnswer.length && <p className="muted">Nothing waiting. ✓</p>}
          {toAnswer.map((r) => (
            <div key={r.id} id={`q-${r.id}`} className="req-row">
              <p style={{ margin: 0 }}><strong>{r.asker?.full_name}</strong> · {r.topic} · {r.homes?.name ?? 'No house'} · <span className="muted small">{fmtDateTime(r.created_at)}</span></p>
              <p style={{ margin: '4px 0' }}>“{r.message}”</p>
              {r.page && <p className="muted small" style={{ margin: 0 }}>Page: <Link href={r.page}>{r.page}</Link></p>}
              <form action={answerHelp} className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                <input type="hidden" name="id" value={r.id} />
                <label style={{ flex: '1 1 260px' }}>Your answer<textarea name="answer" rows={2} /></label>
                <button>💬 Send answer</button>
                <button name="close" value="1" className="secondary">Close without answer</button>
              </form>
            </div>
          ))}
          {answered.length > 0 && (
            <details><summary className="small">Answered recently ({answered.length})</summary>
              <ul className="list compact">{answered.map((r) => <li key={r.id}><span>{r.asker?.full_name}: “{r.message}”{r.answer && <span className="muted small"> → {r.answer}</span>}</span><span className="small muted">{r.answerer?.full_name ?? ''}</span></li>)}</ul>
            </details>
          )}
        </section>
      )}

      <section className="card" id="mine">
        <h2 style={{ marginTop: 0 }}>Ask for help</h2>
        {notReady ? <NotReady what="Help questions" file="help-email-gaps.sql" card={false} /> : (
          <form action={askHelpForm}>
            <input type="hidden" name="page" value="/help" />
            <div className="row">
              <label>What kind of help?
                <select name="topic" defaultValue={HELP_TOPICS[0]}>{HELP_TOPICS.map((t) => <option key={t}>{t}</option>)}</select>
              </label>
            </div>
            <label>What do you need?<textarea name="message" rows={3} required minLength={3} /></label>
            <p className="muted small">How-to questions go to your Program Coordinator and Program Manager. “Something isn’t working” and sign-in problems go to the Administrator.</p>
            <button>Send</button>
          </form>
        )}
        {mine.length > 0 && (
          <>
            <h3>My questions</h3>
            {mine.map((r) => (
              <div key={r.id} id={`q-${r.id}`} className="req-row">
                <p style={{ margin: 0 }}><span className={`badge ${badge(r.status)}`}>{r.status}</span> {r.topic} · <span className="muted small">{fmtDateTime(r.created_at)}</span></p>
                <p style={{ margin: '4px 0' }}>“{r.message}”</p>
                {r.answer && <p className="message ok" style={{ margin: '4px 0' }}>💬 <strong>{r.answerer?.full_name}:</strong> {r.answer}</p>}
                {r.status !== 'Closed' && (
                  <form action={answerHelp}><input type="hidden" name="id" value={r.id} /><button name="close" value="1" className="link small">{r.status === 'Answered' ? '✓ That solved it — close' : 'Cancel this question'}</button></form>
                )}
              </div>
            ))}
          </>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Common questions</h2>
        {FAQ.map((f) => <details key={f.q} className="faq"><summary><strong>{f.q}</strong></summary><p>{f.a}</p></details>)}
        <details className="faq"><summary><strong>Help for every page</strong></summary>
          {PAGE_HELP.map((h) => <div key={h.path}><p style={{ margin: '10px 0 2px' }}><strong>{h.title}</strong></p><ul className="small" style={{ marginTop: 0 }}>{h.tips.map((t) => <li key={t}>{t}</li>)}</ul></div>)}
        </details>
        <p className="small"><Link href="/words">📖 What does this word mean? →</Link></p>
      </section>

      {isAdmin && (
        <section className="card" id="email">
          <h2 style={{ marginTop: 0 }}>📧 Alert emails (Administrator)</h2>
          {!emailReady() && <p className="message">Email isn’t set up: RESEND_API_KEY is missing in Vercel.</p>}
          {mail?.notReady && <NotReady what="Alert emails" file="help-email-gaps.sql" card={false} />}
          {mail && !mail.notReady && (
            <>
              <p>Sent in the last 24 hours: <strong>{mail.sent}</strong> · Waiting for the 7 am email: <strong>{mail.waiting}</strong></p>
              {mail.errors.length > 0 ? (
                <div className="message error"><strong>Recent email errors:</strong>
                  <ul className="small">{mail.errors.map((e, i) => <li key={i}>{e.profiles?.full_name}: {e.email_note.replace(/^error: /, '')}</li>)}</ul>
                </div>
              ) : <p className="muted small">No email errors in the last 3 days.</p>}
            </>
          )}
          <p className="muted small">Urgent alerts (🆘, injuries, safety problems, clock in/out requests, help questions) are emailed right away. Other unread alerts go in one email per person at about 7 am.</p>
          <form action={testEmail}><button className="secondary">Send me a test email</button></form>
        </section>
      )}
    </main>
  );
}
