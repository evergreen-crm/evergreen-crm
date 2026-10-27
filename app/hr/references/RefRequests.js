// 📨 The emailed reference forms for one applicant or staff member: status, answers, and HR buttons.
import { fmtDate, fmtDateTime } from '@/lib/options';
import { REF_FORM, RATING_WORDS } from '@/lib/referenceForm';
import { REMINDER_DAYS } from '@/lib/references';
import { resendRef, cancelRef } from './actions';

const TONE = { Completed: '', Sent: 'warn', Opened: 'warn', Expired: 'bad', 'Not sent': 'bad', Cancelled: '' };
const WORD = { Completed: '✓ Answered', Sent: 'Emailed — waiting', Opened: 'Opened — not sent yet', Expired: 'No reply — phone them', 'Not sent': 'Email not sent', Cancelled: 'Cancelled' };

export default function RefRequests({ requests = [], back }) {
  const latest = [0, 1, 2].map((i) => requests.filter((r) => r.idx === i && r.status !== 'Cancelled').sort((a, b) => b.created_at.localeCompare(a.created_at))[0]).filter(Boolean);
  if (!latest.length) return null;
  const answered = latest.filter((r) => r.status === 'Completed').length;
  return (
    <section className="card" id="references">
      <h2 style={{ marginTop: 0 }}>📨 Emailed reference forms <span className="muted small">— {answered} of 3 answered</span></h2>
      <p className="muted small">Each supervisor got a private form by email. Reminders go out automatically after {REMINDER_DAYS.join(', ')} days; after 21 days HR is told to phone them.</p>
      {latest.map((r) => {
        const a = r.answers ?? {};
        const flag = r.concern || r.rehire === 'No' || r.confirms_supervised === false;
        return (
          <div key={r.id} className={`ref-req${flag ? ' flag' : ''}`}>
            <div className="title-row">
              <strong>{r.idx + 1}. {r.ref_name}</strong>
              <span className={`badge ${flag ? 'bad' : TONE[r.status] ?? ''}`}>{flag ? '⚠️ Concern — read this' : WORD[r.status] ?? r.status}</span>
            </div>
            <p className="small" style={{ margin: '2px 0' }}>{[r.ref_title, r.ref_org, r.ref_relation].filter(Boolean).join(' · ')} · {r.ref_email}{r.ref_phone ? ` · ${r.ref_phone}` : ''}</p>
            <p className="muted small" style={{ margin: '2px 0' }}>
              {r.sent_at ? `Emailed ${fmtDate(r.sent_at.slice(0, 10))}` : 'Not emailed'}{r.reminders ? ` · ${r.reminders} reminder${r.reminders > 1 ? 's' : ''}` : ''}{r.opened_at ? ` · opened ${fmtDate(r.opened_at.slice(0, 10))}` : ''}{r.completed_at ? ` · answered ${fmtDateTime(r.completed_at)}` : ''}{r.send_error ? ` · ${r.send_error}` : ''}
            </p>
            {r.status === 'Completed' ? (
              <details>
                <summary className="small"><strong>Read the answers</strong> (signed by {r.signed_name})</summary>
                <table className="qa-table small">
                  <tbody>
                    <tr><th>Supervised the person</th><td>{a.supervised === 'yes' ? 'Yes' : 'No'}</td></tr>
                    <tr><th>Their title / agency</th><td>{a.your_title} · {a.agency}</td></tr>
                    <tr><th>Position / dates</th><td>{a.position} · {a.from} – {a.to || 'present'}</td></tr>
                    {a.relationship && <tr><th>How they know them</th><td>{a.relationship}</td></tr>}
                    {REF_FORM.ratings.map(([k, l]) => <tr key={k}><th>{l}</th><td>{RATING_WORDS[a[`r_${k}`]] ?? '—'}</td></tr>)}
                    {REF_FORM.text.map(([k, l]) => a[k] ? <tr key={k}><th>{l}</th><td>{a[k]}</td></tr> : null)}
                    <tr><th>Would rehire</th><td className={r.rehire === 'No' ? 'bad-text' : ''}>{r.rehire}</td></tr>
                    <tr><th>Concern working with children, youth or vulnerable adults</th><td className={r.concern ? 'bad-text' : ''}>{r.concern ? `YES — ${a.concern_detail}` : 'No'}</td></tr>
                    {a.comments && <tr><th>Other comments</th><td>{a.comments}</td></tr>}
                  </tbody>
                </table>
              </details>
            ) : (
              <div className="row no-print" style={{ alignItems: 'end', gap: 8 }}>
                <form action={resendRef} className="row" style={{ alignItems: 'end', gap: 8 }}>
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} />
                  <label className="small">Email (fix it if wrong)<input type="email" name="email" defaultValue={r.ref_email} required /></label>
                  <button className="secondary">📨 Send again</button>
                </form>
                <form action={cancelRef}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} /><button className="link small">Cancel</button></form>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
