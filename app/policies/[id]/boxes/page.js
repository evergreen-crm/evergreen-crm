// Admin: set up the signature boxes for a policy version (the staff member signs inside them).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import PolicyBoxes from '@/app/policies/PolicyBoxes';

export const dynamic = 'force-dynamic';

export default async function PolicyBoxesPage({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase } = await requireUser(['admin']);
  const { data: p } = await supabase.from('policies').select('id, title, code, current_version_id').eq('id', id).maybeSingle();
  if (!p) notFound();
  const { data: versions } = await supabase.from('policy_versions').select('id, version_label, file_path, file_name, file_type, fields').eq('policy_id', id).order('published_at', { ascending: false });
  const v = versions?.find((x) => x.id === sp.version) ?? versions?.find((x) => x.id === p.current_version_id);
  if (!v) notFound();
  const isPdf = v.file_type === 'application/pdf' || /\.pdf$/i.test(v.file_name ?? v.file_path);
  const { data: signed } = await supabase.storage.from('policies').createSignedUrl(v.file_path, 3600);
  const initialFields = Array.isArray(v.fields) ? v.fields : [];

  return (
    <main>
      <p className="small no-print"><Link href={`/policies/${p.id}`}>← {p.title}</Link></p>
      <h1>Signature boxes · {p.code ? `${p.code} · ` : ''}{p.title}</h1>
      <p className="small no-print">Version: {versions?.map((x) => (
        <span key={x.id} style={{ marginRight: 10 }}>{x.id === v.id ? <strong>v{x.version_label}</strong> : <Link href={`/policies/${p.id}/boxes?version=${x.id}`}>v{x.version_label}</Link>}{x.id === p.current_version_id ? ' (current)' : ''}</span>
      ))}</p>
      {!isPdf ? <p className="message error">Only PDF policies can have signature boxes. Upload a PDF version first.</p>
        : !signed?.signedUrl ? <p className="message error">The policy file couldn’t be opened.</p>
        : <PolicyBoxes versionId={v.id} versionLabel={v.version_label} url={signed.signedUrl} initialFields={initialFields} />}
    </main>
  );
}
