// One record as a printable form for one resident. Answer it and save, or print it for the file.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ENTRY_TYPES } from '@/lib/entries';
import { recordsFor } from '@/lib/records';
import RecordForm from '@/app/components/RecordForm';

export default async function RecordFormPage({ params }) {
  const { id, kind } = await params;
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const type = ENTRY_TYPES[kind];
  const { data: resident } = await supabase.from('residents').select('id, first_name, last_name, preferred_name, home_id').eq('id', id).maybeSingle();
  if (!type || !resident) notFound();
  const { data: home } = await supabase.from('homes').select('name, program').eq('id', resident.home_id).maybeSingle();
  const std = recordsFor(home?.program).find((r) => r.kind === kind);
  const { data: goals } = await supabase.from('goals').select('id, title').eq('resident_id', id).eq('status', 'Active');
  const name = `${resident.preferred_name || resident.first_name} ${resident.last_name}`;
  return (
    <main>
      <p className="small no-print"><Link href={`/homes/${resident.home_id}?tab=dashboard`}>← {home?.name ?? 'House'}</Link> · <Link href={`/residents/${id}?tab=logs&type=${kind}`}>Past entries</Link></p>
      <RecordForm kind={kind} homeId={resident.home_id} residentId={id} path={`/residents/${id}?tab=logs&type=${kind}`}
        goals={goals ?? []} title={std?.section ?? type.label} standard={std?.standard} resident={name} home={home?.name ?? ''} />
    </main>
  );
}
