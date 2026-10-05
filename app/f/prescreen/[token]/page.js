// Public employment prescreen — opened from the private link HR sends. No sign-in needed.
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime } from '@/lib/options';
import { sessionHashFor } from '@/app/f/prescreen/actions';
import PrescreenCodeGate from './PrescreenCodeGate';
import PrescreenFill from './PrescreenFill';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Employment prescreen · Evergreen Community Care', robots: { index: false, follow: false } };

function Shell({ children }) {
  return (
    <main className="if-page">
      <div className="if-head"><img src="/logo.png" alt="Evergreen Community Care" /></div>
      {children}
      <p className="muted small if-foot">Evergreen Community Care Inc. · Your information is kept private and used only to assess your application.</p>
    </main>
  );
}

export default async function PrescreenPage({ params }) {
  const { token } = await params;
  if (!/^[0-9a-f]{40,80}$/i.test(token)) return <Shell><div className="card"><h2>This link is not valid.</h2></div></Shell>;
  const supabase = await createClient();
  const { data } = await supabase.rpc('prescreen_open', { t: token, sess: await sessionHashFor(token) });
  const r = data?.[0];
  if (!r) return <Shell><div className="card"><h2>This link is not valid.</h2><p>Please contact Evergreen Community Care for a new link.</p></div></Shell>;
  if (r.link_status === 'Submitted') return <Shell><div className="card if-done"><h2>✓ Already signed</h2><p>This prescreen was signed by {r.signed_name} on {fmtDateTime(r.signed_at)}. Thank you.</p></div></Shell>;
  if (r.link_status === 'Cancelled') return <Shell><div className="card"><h2>This link was cancelled.</h2><p>Please contact Evergreen Community Care.</p></div></Shell>;
  if (r.expired) return <Shell><div className="card"><h2>This link has expired.</h2><p>Please ask Evergreen Community Care to send you a new one.</p></div></Shell>;

  if (r.needs_code && !r.verified) {
    return (
      <Shell>
        <div className="if-title card">
          <p className="muted small">Evergreen Community Care · Employment prescreen</p>
          <h1>Hello {r.first_name}</h1>
          <p>Thank you for your interest in working with us.</p>
        </div>
        <PrescreenCodeGate token={token} emailHint={r.email_hint} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="if-title card">
        <p className="muted small">Evergreen Community Care · Pre-employment screening</p>
        <h1>Tell us about yourself</h1>
        <p className="small">This takes about 15 minutes. Fields marked * are required. You’ll type your experience, list three work references (one must be a manager or supervisor) and sign at the end.</p>
      </div>
      <PrescreenFill token={token} start={{ first: r.first_name ?? '', last: r.last_name ?? '', email: r.email ?? '', phone: r.phone ?? '', position: r.job_position ?? '', program: r.program ?? '' }} />
    </Shell>
  );
}
