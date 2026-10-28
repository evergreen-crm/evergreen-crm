// "Logs" tab: MCFD day book and wellness checks (MCFD houses only), contact log, health logs, behaviour (ABC).
import Link from 'next/link';
import { RESIDENT_LOG_GROUPS, typesIn, ENTRY_TYPES } from '@/lib/entries';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
const lvl = (p) => (p.role === 'admin' ? 8 : levelOf(p));
import EntryForm from '@/app/components/EntryForm';
import EntryList from '@/app/components/EntryList';

export default async function Logs({ supabase, resident, type, isAdmin }) {
  const { user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: home } = await supabase.from('homes').select('program').eq('id', resident.home_id).maybeSingle();
  // MCFD documentation only shows in MCFD houses; CLBC documentation shows in CLBC houses.
  const groups = RESIDENT_LOG_GROUPS
    .filter((g) => g !== 'MCFD' || home?.program === 'MCFD')
    .map((g) => ({ name: g, types: typesIn(g).filter((t) => !t.hidden) }));
  const allKinds = groups.flatMap((g) => g.types.map((t) => t.key));
  const kind = allKinds.includes(type) ? type : null;
  const path = `/residents/${resident.id}`;
  const base = `${path}?tab=logs`;

  let q = supabase.from('entries').select('*, author:created_by(full_name), updater:updated_by(full_name)').eq('resident_id', resident.id);
  q = kind ? q.eq('kind', kind) : q.in('kind', allKinds);
  const { data: entries } = await q.order('entry_date', { ascending: false }).order('entry_time', { ascending: false, nullsFirst: false }).limit(150);

  const ids = (entries ?? []).filter((e) => e.version > 1).map((e) => e.id);
  const { data: vers } = ids.length
    ? await supabase.from('entry_versions').select('*, saver:saved_by(full_name)').in('entry_id', ids).order('version', { ascending: false })
    : { data: [] };
  const versions = {};
  for (const v of vers ?? []) (versions[v.entry_id] ??= []).push(v);

  // Staff: their own entries, for 30 minutes after saving. Coordinators (their house), managers, admins: any time.
  const senior = isAdmin || lvl(profile) >= 2;
  const now = Date.now();
  const canCorrect = (e) => senior || (e.created_by === user.id && now - new Date(e.created_at).getTime() < 30 * 60 * 1000);

  return (
    <section>
      <div className="pills no-print">
        <Link href={base} className={!kind ? 'on' : ''}>All logs</Link>
        {groups.map((g) => (
          <span key={g.name} className="pill-group">
            <span className="muted small">{g.name === 'MCFD' ? 'MCFD documentation' : g.name}:</span>
            {g.types.map((t) => <Link key={t.key} href={`${base}&type=${t.key}`} className={kind === t.key ? 'on' : ''}>{t.icon} {t.label}</Link>)}
          </span>
        ))}
      </div>
      {kind
        ? <EntryForm kind={kind} homeId={resident.home_id} residentId={resident.id} path={path} shareable={!['Behaviour', 'MCFD'].includes(ENTRY_TYPES[kind].group)} open />
        : <p className="muted small no-print">Pick a log type above to add an entry. Every save shows the date and time, and corrections keep the earlier version. Staff can correct their own entry for 30 minutes after saving.</p>}
      <EntryList entries={entries} versions={versions} path={path} isAdmin={isAdmin} canCorrect={canCorrect} showFamily />
    </section>
  );
}
