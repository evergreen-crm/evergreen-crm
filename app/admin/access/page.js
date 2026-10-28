// 👤 Access & departments: give each person one department (and extras) in one step. Admin and CEO only.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf, levelName, groupName } from '@/lib/levels';
import AccessList from './AccessList';
import { SECTIONS } from '@/lib/sections';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Access & departments · Evergreen' };

export default async function AccessPage() {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!(profile.role === 'admin' || levelOf(profile) >= 7)) redirect('/more?error=' + encodeURIComponent('Only the administrator and the CEO can give access.'));
  const { data: people, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, level, staff_group, department, extra_departments, active')
    .order('full_name');
  const { data: own } = await supabase.from('person_section_access').select('profile_id, section, level');
  const ownBy = {};
  for (const r of own ?? []) (ownBy[r.profile_id] ??= {})[r.section] = r.level;
  const sections = SECTIONS.map(({ key, icon, label }) => ({ key, icon, label }));
  const { data: homeRows } = await supabase.from('homes').select('id, name').order('name');
  const { data: assigned } = await supabase.from('manager_homes').select('profile_id, home_id');
  const homeIdsBy = {};
  for (const a of assigned ?? []) (homeIdsBy[a.profile_id] ??= []).push(a.home_id);
  const rows = (people ?? []).map((p) => ({
    own: ownBy[p.id] ?? {},
    homeIds: homeIdsBy[p.id] ?? [],
    canHouses: !(p.role === 'admin' || levelOf(p) >= 4) && !groupName(p.staff_group) && (levelOf(p) === 2 || levelOf(p) === 3),
    id: p.id,
    name: p.full_name ?? 'No name',
    job: p.role === 'admin' ? 'Administrator' : (groupName(p.staff_group) ?? levelName(levelOf(p))),
    level: levelOf(p),
    fullAccess: p.role === 'admin' || levelOf(p) >= 7,
    department: p.department ?? '',
    extra: p.extra_departments ?? [],
    active: p.active !== false,
  }));
  return (
    <main>
      <p className="small no-print"><Link href="/s/adm">← Admin</Link></p>
      <h1>👤 Access &amp; departments</h1>
      <p className="small">Pick a department for each person, then press <strong>Save</strong>. The box underneath shows exactly which menu sections they’ll see. The administrator and CEO always see everything.</p>
      {error && <p className="message">Could not load people: {error.message}</p>}
      <AccessList rows={rows} sections={sections} homes={homeRows ?? []} />
    </main>
  );
}
