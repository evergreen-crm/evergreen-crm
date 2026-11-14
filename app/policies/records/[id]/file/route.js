// One person's full policy file for audits and investigations: the witness record and every signed policy,
// as one ZIP (each policy a separate PDF), one combined PDF, or a Word summary sheet (?format=doc). HR, directors and the Administrator only. Logged.
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { canPullPolicyFiles } from '@/lib/levels';
import { TZ } from '@/lib/options';
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
  const { data: rec } = await admin.from('policy_records').select('id, profile_id, items, file_path, status, ready_at, witnessed_name, witnessed_role, witnessed_at, person:profile_id(full_name, homes(name))').eq('id', id).maybeSingle();
  if (!rec) return no('That record was not found.', 404);
  const format = new URL(req.url).searchParams.get('format');
  const fileName = `${String(rec.person?.full_name ?? 'staff').replace(/[^A-Za-z0-9]+/g, '-')}-policy`;
  if (format === 'doc') {
    // A summary sheet that opens in Word: who signed what, which version, when, and the witness.
    const e = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const when = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }) : '');
    const rows = (rec.items ?? []).map((it, i) => `<tr><td>${i + 1}</td><td>${e(it.code)}</td><td>${e(it.title)}</td><td>${e(it.version_label ? 'v' + it.version_label : '')}</td><td>${e(when(it.signed_at))}</td></tr>`).join('');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Policy sign-off summary</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h1{font-size:16pt;color:#0b5a34}table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:4pt 6pt;text-align:left;vertical-align:top}th{background:#e6f0ea}</style></head><body>
<h1>Evergreen Community Care — Policy sign-off summary</h1>
<p><b>Staff member:</b> ${e(rec.person?.full_name)}<br><b>House:</b> ${e(rec.person?.homes?.name ?? 'None')}<br><b>All policies signed:</b> ${e(when(rec.ready_at))}<br>
<b>Witness:</b> ${rec.status === 'witnessed' ? `${e(rec.witnessed_name)} (${e(rec.witnessed_role)}), ${e(when(rec.witnessed_at))}` : 'Not witnessed yet'}</p>
<table><tr><th>#</th><th>Code</th><th>Policy</th><th>Version</th><th>Signed</th></tr>${rows}</table>
<p style="font-size:9pt;color:#555">Summary only. The signed policies, with the signatures inside, are in the full policy file (ZIP or PDF). Confidential. Made ${e(when(new Date()))} by ${e(profile.full_name)}.</p></body></html>`;
    await logPolicyAccess(admin, { by: profile, what: 'Policy sign-off summary downloaded (Word)', staffId: rec.profile_id, staffName: rec.person?.full_name ?? 'Staff', recordId: rec.id });
    return new Response(html, { headers: { 'Content-Type': 'application/msword; charset=utf-8', 'Content-Disposition': `attachment; filename="${fileName}-summary-${new Date().toISOString().slice(0, 10)}.doc"`, 'Cache-Control': 'no-store' } });
  }
  const { parts, missing } = await loadPolicyFileParts(admin, rec);
  if (!parts.length) return no('There are no signed copies in this record yet.', 404);
  const asPdf = format === 'pdf';
  const name = `${fileName}-file-${new Date().toISOString().slice(0, 10)}`;
  if (missing.length) parts.push({ name: 'MISSING-COPIES.txt', bytes: Buffer.from(`No signed copy was found for:\n${missing.join('\n')}\n`) });
  const body = asPdf ? await mergePdf(parts.filter((p) => p.name.endsWith('.pdf'))) : zip(parts);
  await logPolicyAccess(admin, { by: profile, what: `Full policy file downloaded (${asPdf ? 'one PDF' : 'ZIP'}, ${parts.length} files)`, staffId: rec.profile_id, staffName: rec.person?.full_name ?? 'Staff', recordId: rec.id });
  return new Response(body, { headers: { 'Content-Type': asPdf ? 'application/pdf' : 'application/zip', 'Content-Disposition': `attachment; filename="${name}.${asPdf ? 'pdf' : 'zip'}"`, 'Cache-Control': 'no-store' } });
}
