// The signed-in staff member's own onboarding checklist.
import { requireUser } from '@/lib/auth';
import OnboardingView from './OnboardingView';
import OrientationPlan from './OrientationPlan';
import Link from 'next/link';
import { plainError } from '@/lib/plain';

export default async function MyOnboarding({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: onb } = await supabase.from('onboardings').select('*').eq('profile_id', user.id).maybeSingle();
  const { data: signRow } = await supabase.from('onboarding_items')
    .select('id, signed_name, signed_at, status').eq('onboarding_id', onb?.id ?? '00000000-0000-0000-0000-000000000000').eq('item_key', 'orientation').maybeSingle();
  const { data: staffDet } = await supabase.from('staff_details').select('hire_date').eq('profile_id', user.id).maybeSingle();
  const { data: planItems } = await supabase.from('orientation_plan_items')
    .select('id, day_number, sort, start_time, end_time, kind, title, notes, quiz_no, pass_mark, program')
    .eq('active', true).order('day_number').order('sort');
  if (!onb) {
    return (
      <main>
        <h1>My onboarding</h1>
        <p className="muted">You don’t have an onboarding checklist. Your manager sends it when you’re hired.</p>
        <OrientationPlan items={planItems} sign={signRow} fullName={profile.full_name} startDate={staffDet?.hire_date ?? null} />
      </main>
    );
  }
  // Once onboarding is complete it's locked: the signed forms are kept in the staff file, not shown to the person.
  if (onb.status === 'Complete') {
    return (
      <main>
        <h1>My onboarding</h1>
        <section className="card">
          <p><strong>✓ Your onboarding is complete.</strong> Everything you filled in and signed is saved in your staff file. HR and your leaders can see it there.</p>
          <p><Link href="/offer">View my offer letter →</Link></p>
        </section>
      </main>
    );
  }
  return (
    <>
      <OrientationPlan items={planItems} sign={signRow} fullName={profile.full_name} startDate={staffDet?.hire_date ?? null} />
      <OnboardingView supabase={supabase} onb={onb} person={profile}
        viewer={{ isSelf: true, isBoss: false }} notice={sp.error ? { bad: true, text: plainError(sp.error) } : sp.saved ? { bad: false, text: 'Saved.' } : null} />
    </>
  );
}
