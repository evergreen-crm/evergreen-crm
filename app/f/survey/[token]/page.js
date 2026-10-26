// Public survey page — opened from the email link (or by staff with a youth, on a phone or tablet).
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { SURVEYS } from '@/lib/surveys';
import SurveyForm from './SurveyForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Feedback · Evergreen Community Care', robots: { index: false, follow: false } };

function Shell({ children }) {
  return (
    <main className="if-page">
      <div className="if-head"><img src="/logo.png" alt="Evergreen Community Care" /></div>
      {children}
      <p className="muted small if-foot">Evergreen Community Care Inc. · Your answers are kept private and used only to improve our services.</p>
    </main>
  );
}

export default async function SurveyPage({ params }) {
  const { token } = await params;
  if (!/^[0-9a-f]{40,80}$/i.test(token) || !adminKey()) return <Shell><div className="card"><h2>This link is not valid.</h2></div></Shell>;
  const admin = createAdminClient();
  const { data: s } = await admin.from('survey_sends').select('id, survey_key, status, expires_at, opened_at, residents(first_name, preferred_name)').eq('token', token).maybeSingle();
  if (!s) return <Shell><div className="card"><h2>This link is not valid.</h2></div></Shell>;
  if (s.status === 'Completed') return <Shell><div className="card if-done"><h2>✓ Thank you!</h2><p>Your answers were received.</p></div></Shell>;
  if (!['Sent', 'Waiting'].includes(s.status) || new Date(s.expires_at) < new Date()) return <Shell><div className="card"><h2>This survey has closed.</h2><p>Thank you for your interest.</p></div></Shell>;
  if (!s.opened_at) await admin.from('survey_sends').update({ opened_at: new Date().toISOString() }).eq('id', s.id);
  const def = SURVEYS[s.survey_key];
  const who = s.residents ? s.residents.preferred_name || s.residents.first_name : null;
  return (
    <Shell>
      <div className="if-title card">
        <p className="muted small">Evergreen Community Care · {def.audience}</p>
        <h1>{def.title}</h1>
        <p className="small">{def.intro}{who && s.survey_key !== 'youth' ? ` These questions are about the services for ${who}.` : ''}</p>
      </div>
      <SurveyForm token={token} surveyKey={s.survey_key} />
    </Shell>
  );
}
