// Manager view of one staff member's onboarding: send the request, review, verify.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { todayISO } from '@/lib/options';
import { startOnboarding } from '@/app/onboarding/actions';
import OnboardingView from '@/app/onboarding/OnboardingView';

export default async function StaffOnboarding({ params }) {
  const { id } = await params;
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const [{ data: person }, { data: onb }, { data: details }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, role').eq('id', id).maybeSingle(),
    supabase.from('onboardings').select('*').eq('profile_id', id).maybeSingle(),
    supabase.from('staff_details').select('hire_date, program').eq('profile_id', id).maybeSingle(),
  ]);
  if (!person) notFound();

  if (!onb) {
    return (
      <main>
        <p className="small"><Link href={`/hr/${id}`}>← {person.full_name}</Link></p>
        <h1>Send onboarding request</h1>
        <form action={startOnboarding} className="card">
          <input type="hidden" name="profile_id" value={id} />
          <p>This creates {person.full_name}’s onboarding checklist from Evergreen’s requirements:</p>
          <ul className="rules">
            <li>Personal information and a drawn signature</li>
            <li>Personnel file (Standard G.1): CRC, references, fitness declaration, résumé, qualifications, offer and orientation sign-off</li>
            <li>11 policies to read and sign electronically</li>
            <li>Every policy in the Policy library that applies to their program, to read and sign</li>
            <li>Evergreen Academy mandatory training for their program, with due dates from the hire date — each verified training gets a certificate</li>
          </ul>
          <div className="row">
            <label>Hire date<input type="date" name="hire_date" required defaultValue={details?.hire_date ?? todayISO()} /></label>
            <label>Which program will they work in?
              <select name="program" defaultValue={details?.program ?? 'Both'}>
                <option value="MCFD">MCFD only — children & youth homes</option>
                <option value="CLBC">CLBC only — adult homes</option>
                <option value="Both">Both MCFD and CLBC</option>
              </select>
            </label>
          </div>
          <button>Send onboarding request</button>
          <p className="muted small">
            {person.full_name} sees it as <strong>My onboarding</strong> in the menu the next time they sign in
            {person.email && <> ({person.email})</>}. They need an Evergreen account first (Admin → Give access).
          </p>
        </form>
      </main>
    );
  }
  return (
    <>
      <div className="page-crumb no-print"><Link href={`/hr/${id}`}>← {person.full_name}’s HR file</Link></div>
      <OnboardingView supabase={supabase} onb={onb} person={person} viewer={{ isSelf: false, isBoss: true }} />
    </>
  );
}
