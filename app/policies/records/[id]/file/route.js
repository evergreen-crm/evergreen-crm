// One person's full policy file for audits and investigations: the witness record and every signed policy,
// as one ZIP (each policy a separate PDF) or one combined PDF. HR, directors and the Administrator only. Logged.
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { canPullPolicyFiles } from '@/lib/levels';
import { loadPolicyFileParts, mergePdf, zip, logPolicyAccess } from '@/lib/policyFile';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const no = (msg, status = 403) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export async function GET(req, { params }) {
  const { id } = await params;
  const { profile } = await getCurrentUser();
  if (!profile) return no('Please sign in.', 401);
  if (!canPullPolicyFiles(profile)) return no('Only HR, a director or the Administrator can download a policy file.');
  if (!adminKey()) return no('Signed copies are not set up yet.', 500);
  const admin = createAdminClient();
  const { data: rec } = await admin.from('policy_records').select('id, profile_id, items, file_path, person:profile_id(full_name)').eq('id', id).maybeSingle();
  if (!rec) return no('That record was not found.', 404);
  const { parts, missing } = await loadPolicyFileParts(admin, rec);
  if (!parts.length) return no('There are no signed copies in this record yet.', 404);
  const asPdf = new URL(req.url).searchParams.get('format') === 'pdf';
  const name = `${String(rec.person?.full_name ?? 'staff').replace(/[^A-Za-z0-9]+/g, '-')}-policy-file-${new Date().toISOString().slice(0, 10)}`;
  if (missing.length) parts.push({ name: 'MISSING-COPIES.txt', bytes: Buffer.from(`No signed copy was found for:\n${missing.join('\n')}\n`) });
  const body = asPdf ? await mergePdf(parts.filter((p) => p.name.endsWith('.pdf'))) : zip(parts);
  await logPolicyAccess(admin, { by: profile, what: `Full policy file downloaded (${asPdf ? 'one PDF' : 'ZIP'}, ${parts.length} files)`, staffId: rec.profile_id, staffName: rec.person?.full_name ?? 'Staff', recordId: rec.id });
  return new Response(body, { headers: { 'Content-Type': asPdf ? 'application/pdf' : 'application/zip', 'Content-Disposition': `attachment; filename="${name}.${asPdf ? 'pdf' : 'zip'}"`, 'Cache-Control': 'no-store' } });
}
