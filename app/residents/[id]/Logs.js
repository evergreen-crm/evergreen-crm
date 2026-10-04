// "Logs" tab: contact log, health logs (vitals, weight, sleep, seizure, bowel), behaviour (ABC).
import Link from 'next/link';
import { RESIDENT_LOG_GROUPS, typesIn, ENTRY_TYPES } from '@/lib/entries';
import EntryForm from '@/app/components/EntryForm';
import EntryList from '@/app/components/EntryList';

export default async function Logs({ supabase, resident, type, isAdmin }) {
  const groups = RESIDENT_LOG_GROUPS.map((g) => ({ name: g, types: typesIn(g).filter((t) => !t.hidden) }));
  const allKinds = groups.flatMap((g) => g.types.map((t) => t.key));
  const kind = allKinds.includes(type) ? type : null;
  const path = `/residents/${resident.id}`;
  const base = `${path}?tab=logs`;

  let q = supabase.from('entries').select('*, author:created_by(full_name)').eq('resident_id', resident.id);
  q = kind ? q.eq('kind', kind) : q.in('kind', allKinds);
  const { data: entries } = await q.order('entry_date', { ascending: false }).order('entry_time', { ascending: false, nullsFirst: false }).limit(150);

  return (
    <section>
      <div className="pills no-print">
        <Link href={base} className={!kind ? 'on' : ''}>All logs</Link>
        {groups.map((g) => (
          <span key={g.name} className="pill-group">
            <span className="muted small">{g.name}:</span>
            {g.types.map((t) => <Link key={t.key} href={`${base}&type=${t.key}`} className={kind === t.key ? 'on' : ''}>{t.icon} {t.label}</Link>)}
          </span>
        ))}
      </div>
      {kind
        ? <EntryForm kind={kind} homeId={resident.home_id} residentId={resident.id} path={path} shareable={ENTRY_TYPES[kind].group !== 'Behaviour'} open />
        : <p className="muted small no-print">Pick a log type above to add an entry.</p>}
      <EntryList entries={entries} path={path} isAdmin={isAdmin} showFamily />
    </section>
  );
}
