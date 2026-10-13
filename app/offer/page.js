// "My offer letter": opens the newest offer for the signed-in person.
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

export default async function MyOffer() {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const { data } = await supabase.from('offer_letters').select('id').eq('profile_id', user.id).neq('status', 'Draft')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (data) redirect(`/offer/${data.id}`);
  return <main><h1>My offer letter</h1><p className="card muted">You don’t have an offer letter in the portal yet. HR will send it here for you to sign.</p></main>;
}
