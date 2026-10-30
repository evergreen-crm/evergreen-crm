// Signed paperwork and course-pass PDFs for one person, newest first. The viewer's own database access
// decides which rows they see (staff: their own; HR, directors, Admin: everyone; PC/PM: their homes).
import { paperworkLinks } from '@/lib/paperworkPdf';
import { TZ } from '@/lib/options';

const day = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric' });

export default async function PaperworkList({ supabase, profileId, title = 'Signed paperwork and course records (PDF)' }) {
  const { data: rows, error } = await supabase.from('paperwork_pdfs')
    .select('id, kind, title, file_path, created_at, onedrive_status')
    .eq('profile_id', profileId).order('created_at', { ascending: false }).limit(200);
  if (error) return null;
  const links = await paperworkLinks(rows);
  return (
    <section className="card">
      <h2>{title}</h2>
      {!rows?.length
        ? <p className="muted small">Nothing yet. A PDF is saved here each time a paper is signed or an Academy course is passed.</p>
        : (
          <table>
            <thead><tr><th>Date</th><th>Record</th><th>Type</th><th>PDF</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="small">{day(r.created_at)}</td>
                <td>{r.title}</td>
                <td className="small">{r.kind === 'signed' ? 'Signed paper' : 'Course passed'}</td>
                <td>{links[r.id] ? <a href={links[r.id]} target="_blank" rel="noreferrer">Open</a> : <span className="muted small">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
    </section>
  );
}
