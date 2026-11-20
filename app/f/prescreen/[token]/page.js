// Public employment prescreen — opened from the private link HR sends. No sign-in needed.
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime } from '@/lib/options';
import { sessionHashFor } from '@/app/f/prescreen/actions';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
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

  // Extra details for this link (the token is the key): application number, job, copied answers, files already uploaded.
  const { data: x } = adminKey() ? await createAdminClient().from('prescreens')
    .select('application_no, prefill, draft, draft_saved_at, program, drives, gives_meds, lived_outside, resume_name, cover_name, cert_files, posting:posting_id(title, job_id)').eq('token', token).maybeSingle() : { data: null };
  const files = { resume: x?.resume_name ?? null, cover: x?.cover_name ?? null, docs: (x?.cert_files ?? []).map((f) => ({ key: f.key, name: f.name, path: f.path })) };
  return (
    <Shell>
      <div className="if-title card">
        <p className="muted small">Evergreen Community Care · Pre-employment screening{x?.application_no ? ` · Application ${x.application_no}` : ''}</p>
        <h1>Tell us about yourself</h1>
        {x?.posting && <p className="small">Job: <a href={`/jobs/${x.posting.job_id}`} target="_blank" rel="noopener">{x.posting.title} ({x.posting.job_id})</a></p>}
        <p className="small">This takes about 15–20 minutes on a phone or computer. Fields marked * are required. You’ll tick the requirements checklist and upload your resume and certificates, list three supervisor references, tell us when you can come to an interview, and sign at the end.</p>
      </div>
      <PrescreenFill token={token} start={{ first: r.first_name ?? '', last: r.last_name ?? '', email: r.email ?? '', phone: r.phone ?? '', position: r.job_position ?? '',
        program: x?.program ?? r.program ?? '', drives: !!x?.drives, meds: x?.gives_meds !== false, prefill: x?.prefill ?? null, draft: x?.draft ?? null, draftSavedAt: x?.draft_saved_at ?? null, files, applicationNo: x?.application_no ?? null }} />
    </Shell>
  );
}
