// 🔒 Security settings (administrator only): who can see each menu section — and, for Individuals, Houses and
// Schedule, which houses' records. supabase/section-access.sql · lib/sections.js
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { SECTIONS, ROLES, LEVELS, DEFAULTS } from '@/lib/sections';
import { fmtDateTime } from '@/lib/options';
import SecurityGrid from './SecurityGrid';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Security settings · Evergreen' };

export default async function Security() {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (profile.role !== 'admin') redirect('/more?error=' + encodeURIComponent('Security settings are for the administrator only.'));
  const [{ data: rows, error }, { data: log }] = await Promise.all([
    supabase.from('section_access').select('section, role, level'),
    supabase.from('section_access_log').select('id, section, role, old_level, new_level, changed_at, who:changed_by(full_name)').order('changed_at', { ascending: false }).limit(40),
  ]);
  const notReady = error && /relation|schema/i.test(error.message);
  const grid = structuredClone(DEFAULTS);
  for (const r of rows ?? []) (grid[r.section] ??= {})[r.role] = r.level;
  const sections = SECTIONS.map(({ key, icon, label }) => ({ key, icon, label }));
  const secName = Object.fromEntries(SECTIONS.map((s) => [s.key, `${s.icon} ${s.label}`]));
  const roleName = Object.fromEntries(ROLES);
  return (
    <main>
      <p className="small no-print"><Link href="/s/adm">← Admin</Link></p>
      <h1>🔒 Security settings</h1>
      <p className="small">Choose who can see each part of the CRM. The menu, the section pages and the database rules all follow this one table, so they can’t disagree.</p>
      {notReady && <p className="message">Security settings aren’t switched on yet (setup file: section-access.sql). The recommended settings are shown below.</p>}
      <SecurityGrid sections={sections} grid={grid} />
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Change history</h2>
        {!(log ?? []).length && <p className="muted small">No changes yet.</p>}
        <ul className="list compact">{(log ?? []).map((l) => (
          <li key={l.id}><span className="small">{secName[l.section] ?? l.section} · {roleName[l.role] ?? l.role}: {LEVELS[l.old_level]?.name ?? '—'} → <strong>{LEVELS[l.new_level]?.name ?? l.new_level}</strong></span>
            <span className="muted small">{l.who?.full_name ?? ''} · {fmtDateTime(l.changed_at)}</span></li>
        ))}</ul>
      </section>
    </main>
  );
}
