// The signed-in staff member's own onboarding checklist.
import { requireUser } from '@/lib/auth';
import OnboardingView from './OnboardingView';

export default async function MyOnboarding() {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: onb } = await supabase.from('onboardings').select('*').eq('profile_id', user.id).maybeSingle();
  if (!onb) {
    return (
      <main>
        <h1>My onboarding</h1>
        <p className="muted">You don’t have an onboarding checklist. Your manager sends it when you’re hired.</p>
      </main>
    );
  }
  return <OnboardingView supabase={supabase} onb={onb} person={profile}
    viewer={{ isSelf: true, isBoss: false }} />;
}
