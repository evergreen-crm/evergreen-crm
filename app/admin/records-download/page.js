// 💾 Monthly records download (plan E4): a stopgap backup until the nightly OneDrive backup is set up.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDateTime } from '@/lib/options';
import { AREAS, areaSummary } from '@/lib/recordsExport';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Records download · Evergreen' };

export default async function RecordsDownload() {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isAdmin = profile.role === 'admin';
  if (!isAdmin && !(levelOf(profile) >= 7 && !profile.staff_group)) redirect('/');
  const [{ data: log }, counts] = await Promise.all([
    supabase.from('records_exports').select('area, tables, rows_total, exported_at, by:exported_by(full_name)').order('exported_at', { ascending: false }).limit(30),
    isAdmin ? areaSummary().catch(() => null) : Promise.resolve(null),
  ]);
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Etc/GMT+7' }).format(new Date()).slice(0, 7);
  const doneThisMonth = new Set((log ?? []).filter((x) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Etc/GMT+7' }).format(new Date(x.exported_at)).slice(0, 7) === month).map((x) => x.area));

  return (
    <main>
      <p><Link href="/admin">← Admin</Link></p>
      <h1>💾 Monthly records download</h1>
      <p className="muted">Until the nightly OneDrive backup is set up, download a copy of every portal record once a month and save it in the secure Evergreen folder (not on a personal device). You get a reminder on the 1st of each month.</p>
      <ul className="small">
        <li>Five Excel files, one per area, with one sheet per table and a “Contents” sheet. Not zipped.</li>
        <li>Uploaded files themselves (signed PDFs, photos, resumes) are not included, only their records. They stay in the portal’s file storage.</li>
        <li>Left out on purpose: sign-in and link codes, the quiz answer keys, the Ask Evergreen search index, and drawn signature images (the signed PDFs keep them).</li>
        <li>These files hold confidential information about youth, adults and staff. Keep them as securely as the portal itself.</li>
      </ul>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Download</h2>
        {isAdmin ? (
          <ul style={{ listStyle: 'none', paddingLeft: 0 }}>{AREAS.map((a) => (
            <li key={a.key} style={{ marginBottom: 10 }}>
              <a className="button" href={`/admin/records-download/file/${a.key}`}>⬇ {a.name}</a>
              <span className="small muted"> {counts ? `${counts[a.key]} tables` : ''}{doneThisMonth.has(a.key) ? ' · ✅ downloaded this month' : ''}</span>
            </li>))}
          </ul>
        ) : <p className="small">Only the Administrator can download the records. You can see the download history below.</p>}
        <p className="muted small">Each file can take up to a minute to build.</p>
      </section>

      <h2>Download history</h2>
      {(log ?? []).length === 0 ? <p className="card muted">No downloads yet.</p> : (
        <table><thead><tr><th>When</th><th>Area</th><th>Tables</th><th>Rows</th><th>By</th></tr></thead>
          <tbody>{log.map((x, i) => (
            <tr key={i}><td className="small">{fmtDateTime(x.exported_at)}</td><td>{AREAS.find((a) => a.key === x.area)?.name ?? x.area}</td><td>{x.tables}</td><td>{x.rows_total}</td><td className="small">{x.by?.full_name ?? '—'}</td></tr>))}
          </tbody></table>
      )}
    </main>
  );
}
