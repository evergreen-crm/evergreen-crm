// One-time: load Evergreen's policy manuals into the Policy library (admin only).
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { loadManifest } from './actions';
import ImportRunner from './ImportRunner';
import ProgramBadge from '@/app/components/ProgramBadge';

export default async function ImportPolicies() {
  await requireUser(['admin']);
  const items = await loadManifest();
  return (
    <main>
      <p className="small"><Link href="/policies">← Policies</Link></p>
      <h1>Import policy manuals</h1>
      <p className="muted">{items.length} manuals from D:\MCFD MANUALS, converted to PDF with a version-control footer on every page. Safe to run more than once — anything already imported is skipped.</p>
      <ImportRunner items={items} />
      <table>
        <thead><tr><th>Manual</th><th>Code</th><th>Version</th><th>Applies to</th><th>Staff sign?</th><th>Pages</th></tr></thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.file}>
              <td>{m.title}<div className="muted small">{m.category}</div></td>
              <td className="small">{m.code || '—'}</td>
              <td>v{m.version}</td>
              <td><ProgramBadge program={m.applies_to} /></td>
              <td>{m.require_signature ? 'Read & sign' : 'Reference'}</td>
              <td>{m.pages}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
