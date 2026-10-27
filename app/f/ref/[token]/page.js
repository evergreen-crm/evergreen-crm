// Public reference form — opened from the email sent to a supervisor reference (no account needed).
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import RefForm from './RefForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reference · Evergreen Community Care', robots: { index: false, follow: false } };

function Shell({ children }) {
  return (
    <main className="if-page">
      <div className="if-head"><img src="/logo.png" alt="Evergreen Community Care" /></div>
      {children}
      <p className="muted small if-foot">Evergreen Community Care Inc. · Your answers are confidential and seen only by our HR team.</p>
    </main>
  );
}

export default async function RefPage({ params }) {
  const { token } = await params;
  if (!/^[0-9a-f]{40,80}$/i.test(token) || !adminKey()) return <Shell><div className="card"><h2>This link is not valid.</h2></div></Shell>;
  const admin = createAdminClient();
  const { data: r } = await admin.from('reference_requests').select('id, status, expires_at, opened_at, about_name, position, ref_name, ref_title, ref_org').eq('token', token).maybeSingle();
  if (!r) return <Shell><div className="card"><h2>This link is not valid.</h2><p>It may have been replaced by a newer email. Please use the latest one.</p></div></Shell>;
  if (r.status === 'Completed') return <Shell><div className="card if-done"><h2>✓ Thank you!</h2><p>Your reference was received.</p></div></Shell>;
  if (!['Sent', 'Opened'].includes(r.status) || new Date(r.expires_at) < new Date()) return <Shell><div className="card"><h2>This link has closed.</h2><p>Please reply to the email and our HR team will contact you.</p></div></Shell>;
  if (!r.opened_at) await admin.from('reference_requests').update({ opened_at: new Date().toISOString(), status: 'Opened' }).eq('id', r.id).eq('status', 'Sent');
  return (
    <Shell>
      <div className="if-title card">
        <p className="muted small">Evergreen Community Care · Confidential reference</p>
        <h1>Reference for {r.about_name}</h1>
        <p className="small">Hello {r.ref_name}. {r.about_name} applied to work with Evergreen{r.position ? ` as ${r.position}` : ''} and named you as someone who supervised them. Evergreen cares for youth and adults in care in British Columbia, so honest references help keep them safe. It takes about 5 minutes. Fields marked * are needed.</p>
      </div>
      <RefForm token={token} about={r.about_name} defaults={{ your_title: r.ref_title ?? '', agency: r.ref_org ?? '' }} />
    </Shell>
  );
}
