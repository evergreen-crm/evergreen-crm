// Public intake form page — opened from the private link in the email. No sign-in needed.
import { createClient } from '@/lib/supabase/server';
import { formByKey, SIGNER_ROLES } from '@/lib/intakeForms';
import { fmtDateTime } from '@/lib/options';
import IntakeFormFill from './IntakeFormFill';
import CodeGate from './CodeGate';
import { sessionHashFor } from '@/app/f/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Intake form · Evergreen Community Care', robots: { index: false, follow: false } };

function Shell({ children }) {
  return (
    <main className="if-page">
      <div className="if-head"><img src="/logo.png" alt="Evergreen Community Care" /></div>
      {children}
      <p className="muted small if-foot">Evergreen Community Care Inc. · Your information is kept private and shared only with people who need it to provide care.</p>
    </main>
  );
}

export default async function IntakeFormPage({ params }) {
  const { token } = await params;
  if (!/^[0-9a-f]{40,80}$/i.test(token)) return <Shell><div className="card"><h2>This link is not valid.</h2></div></Shell>;
  const supabase = await createClient();
  const { data } = await supabase.rpc('intake_open', { t: token, sess: await sessionHashFor(token) });
  const r = data?.[0];
  const form = r && formByKey(r.form_key);
  if (!r || !form) return <Shell><div className="card"><h2>This link is not valid.</h2><p>Please contact Evergreen Community Care for a new link.</p></div></Shell>;
  if (r.status === 'Completed') return <Shell><div className="card if-done"><h2>✓ Already signed</h2><p>This form was signed by {r.signed_name} on {fmtDateTime(r.completed_at)}. Thank you.</p></div></Shell>;
  if (r.status === 'Cancelled') return <Shell><div className="card"><h2>This link was cancelled.</h2><p>Please contact Evergreen Community Care.</p></div></Shell>;
  if (r.expired) return <Shell><div className="card"><h2>This link has expired.</h2><p>Please ask Evergreen Community Care to send you a new one.</p></div></Shell>;

  if (r.needs_code && !r.verified) {
    return (
      <Shell>
        <div className="if-title card">
          <p className="muted small">{form.code} · Evergreen Community Care intake</p>
          <h1>{form.title}</h1>
          <p>Sent to: <strong>{r.recipient_name}</strong></p>
        </div>
        <CodeGate token={token} emailHint={r.email_hint} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="if-title card">
        <p className="muted small">{form.code} · {r.stream === 'MCFD' ? 'MCFD — child / youth' : 'CLBC — adult'}</p>
        <h1>{form.title}</h1>
        <p><strong>For:</strong> {r.person_name} · <strong>Sent to:</strong> {r.recipient_name}{r.recipient_role && ` (${r.recipient_role})`}</p>
        <p className="small">{form.intro}</p>
        <p className="muted small">Fields marked * are required. To send documents (court orders, plans, records), reply to the email you received with them attached.</p>
      </div>
      <IntakeFormFill token={token} form={form} recipientName={r.recipient_name} recipientRole={r.recipient_role} roles={SIGNER_ROLES} />
    </Shell>
  );
}
