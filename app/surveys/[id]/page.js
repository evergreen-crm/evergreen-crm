// Youth survey, done in person: a staff member opens it here and hands the phone or tablet to the youth.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { SURVEYS } from '@/lib/surveys';

export const dynamic = 'force-dynamic';

export default async function YouthSurveyStart({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  if (sp.go) {
    const { data: token } = await supabase.rpc('survey_youth_link', { p_id: id });
    if (token) redirect(`/f/survey/${token}`);
  }
  const { data: s } = await supabase.from('survey_sends').select('id, survey_key, reason, status, expires_at, recipient_name').eq('id', id).maybeSingle();
  const def = SURVEYS.youth;
  return (
    <main>
      <p className="small"><Link href="/todo">← My to-do</Link></p>
      <h1>📋 Youth survey{s?.recipient_name ? ` — ${s.recipient_name}` : ''}</h1>
      {!s ? <p className="card">This survey isn’t available to you.</p>
        : s.status === 'Completed' ? <p className="message ok">Done — thank you. The answers went to the quality assurance team.</p>
        : !['Sent', 'Waiting'].includes(s.status) ? <p className="message">This survey has closed.</p>
        : (
          <div className="card">
            <p>Sit down with {s.recipient_name ?? 'the youth'} somewhere quiet. Explain that the survey helps make their home better, that there are no wrong answers, and that they can skip any question.</p>
            <ul className="small">
              <li>Hand them the phone or tablet and let them answer on their own if they can. Read the questions aloud if they ask.</li>
              <li>Don’t look at or change their answers. When they press <strong>Send</strong>, the answers go straight to the quality assurance team.</li>
              <li>{def.questions.length} questions · about 5 minutes · {s.reason} survey</li>
            </ul>
            <Link className="button" href={`/surveys/${s.id}?go=1`}>Start the survey</Link>
          </div>
        )}
    </main>
  );
}
