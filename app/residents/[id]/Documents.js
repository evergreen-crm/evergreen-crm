// "Documents" tab: files kept in the resident's file (private storage).
import { DOC_CATEGORIES, fmtDate } from '@/lib/options';
import { deleteDocument } from '@/app/residents/modules';
import DocUpload from '@/app/components/DocUpload';

const size = (b) => !b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`;

export default async function Documents({ supabase, resident, canEdit }) {
  const { data: docs } = await supabase.from('documents').select('*, profiles:uploaded_by(full_name)')
    .eq('resident_id', resident.id).order('created_at', { ascending: false });
  // Links that work for 1 hour, only for people allowed to see the file.
  let links = {};
  if (docs?.length) {
    const { data } = await supabase.storage.from('documents').createSignedUrls(docs.map((d) => d.file_path), 3600);
    links = Object.fromEntries((data ?? []).map((s) => [s.path, s.signedUrl]));
  }
  return (
    <section>
      <DocUpload homeId={resident.home_id} residentId={resident.id} categories={DOC_CATEGORIES} />
      {docs?.length === 0 && <p className="muted">No documents yet.</p>}
      {docs?.length > 0 && (
        <table>
          <thead><tr><th>Document</th><th>Category</th><th>Added</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{links[d.file_path] ? <a href={links[d.file_path]} target="_blank" rel="noreferrer">{d.title}</a> : d.title}
                  <div className="muted small">{size(d.file_size)}</div></td>
                <td>{d.category ?? '—'}</td>
                <td>{fmtDate(d.created_at.slice(0, 10))}<div className="muted small">{d.profiles?.full_name}</div></td>
                {canEdit && (
                  <td>
                    <form action={deleteDocument}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="resident_id" value={resident.id} />
                      <button className="link small">Remove</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
