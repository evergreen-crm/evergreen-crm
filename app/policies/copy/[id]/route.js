// Opens one signed policy (the PDF with the signature inside). Locked for the person who signed it.
// Allowed: HR, directors and the Administrator; and the witness, only while the record is waiting for them.
// Every open is written to the security audit log.
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { canPullPolicyFiles } from '@/lib/levels';
import { logPolicyAccess } from '@/lib/policyFile';

export const dynamic = 'force-dynamic';
const no = (msg, status = 403) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export async function GET(_req, { params }) {
  const { id } = await params;
  const { supabase, profile } = await getCurrentUser();
  if (!profile) return no('Please sign in.', 401);
  if (!adminKey()) return no('Signed copies are not set up yet.', 500);
  const admin = createAdminClient();
  const { data: a } = await admin.from('policy_acks').select('id, profile_id, policy_id, finished_path, person:profile_id(full_name), policy:policy_id(title, code)').eq('id', id).maybeSingle();
  if (!a?.finished_path) return no('That signed copy was not found.', 404);
  let recordId = null;
  let ok = canPullPolicyFiles(profile);
  if (!ok && a.profile_id !== profile.id) {
    const { data: can } = await supabase.rpc('can_witness_policy_record', { p: a.profile_id });
    if (can === true) {
      const { data: rec } = await admin.from('policy_records').select('id, items').eq('profile_id', a.profile_id).eq('status', 'awaiting_witness').maybeSingle();
      if (rec && (rec.items ?? []).some((i) => i.ack_id === a.id)) { ok = true; recordId = rec.id; }
    }
  }
  if (!ok) return no('Signed policies are locked. To read a policy, use the staff binder or the residential binder in the house. HR, a director or the Administrator can open a signed copy.');
  const { data: s } = await admin.storage.from('staff-files').createSignedUrl(a.finished_path, 120);
  if (!s?.signedUrl) return no('The signed copy could not be opened.', 500);
  await logPolicyAccess(admin, { by: profile, what: recordId ? 'Signed policy opened for witness review' : 'Signed policy opened', staffId: a.profile_id, staffName: a.person?.full_name ?? 'Staff', policy: `${a.policy?.code ? a.policy.code + ' ' : ''}${a.policy?.title ?? ''}`.trim(), recordId });
  return Response.redirect(s.signedUrl, 302);
}
