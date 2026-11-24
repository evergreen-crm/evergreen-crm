// Load Evergreen's policy manuals into the Policy library (admin only). Nov 16 2026: the folder holds the
// November 2026 library versions from D:\MCFD MANUALS\Evergreen Policy Library\CRM Upload (PDF).
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { loadManifest } from './actions';
import ImportRunner from './ImportRunner';
import ProgramBadge from '@/app/components/ProgramBadge';
import FolderUpload from './FolderUpload';

export default async function ImportPolicies() {
  const { supabase } = await requireUser(['admin']);
  const items = await loadManifest();
  const { data: pols } = await supabase.from('policies').select('id, code, title, applies_to, active, current:current_version_id(version_label)');
  const policies = (pols ?? []).map((p) => ({ id: p.id, code: p.code, title: p.title, applies_to: p.applies_to ?? 'Both', active: p.active, version: p.current?.version_label ?? null }));
  return (
    <main>
      <p className="small"><Link href="/policies">← Policies</Link></p>
      <h1>Upload policies</h1>
      <h2>Upload from a folder you choose</h2>
      <FolderUpload policies={policies} />
      <details>
        <summary><strong>Earlier: the November 16 import</strong> <span className="muted small">— {items.length} manuals that were built into the CRM; not needed again</span></summary>
      <p className="muted">{items.length} manuals from D:\MCFD MANUALS (November 16 copies), converted to PDF with a version-control footer on every page. Safe to run more than once — anything already imported is skipped.</p>
      <h2>1. Import (first time)</h2>
      <ImportRunner items={items} />
      <h2>2. Compress</h2>
      <p className="muted small">Replaces each manual’s file with a compressed copy of the same version (about {Math.round(items.reduce((s, m) => s + (m.bytes ?? 0), 0) / 1e6)} MB in total, about 67% smaller). Nothing else changes — signatures and history stay.</p>
      <ImportRunner items={items} mode="compress" />
      <table>
        <thead><tr><th>Manual</th><th>Code</th><th>Version</th><th>Applies to</th><th>Staff sign?</th><th>Pages</th><th>Size</th></tr></thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.file}>
              <td>{m.title}<div className="muted small">{m.category}</div></td>
              <td className="small">{m.code || '—'}</td>
              <td>v{m.version}</td>
              <td><ProgramBadge program={m.applies_to} /></td>
              <td>{m.require_signature ? 'Read & sign' : 'Reference'}</td>
              <td>{m.pages}</td>
              <td className="small">{m.bytes ? `${Math.round(m.bytes / 1024)} KB` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </details>
    </main>
  );
}
