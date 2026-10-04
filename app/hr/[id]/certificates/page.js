// Every training certificate for one person, one per printed page.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import Certificate from '@/app/hr/Certificate';
import PrintButton from '@/app/PrintButton';

export default async function AllCertificates({ params }) {
  const { id } = await params;
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const [{ data: person }, { data: list }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, staff_details(employee_no)').eq('id', id).maybeSingle(),
    supabase.from('trainings').select('*, verifier:verified_by(full_name)').eq('profile_id', id).not('verified_by', 'is', null).order('completed_on'),
  ]);
  if (!person) notFound();
  return (
    <main className="cert-page">
      <style>{'@page { size: landscape; margin: 10mm; }'}</style>
      <p className="no-print small"><Link href={`/hr/${id}`}>← {person.full_name}’s HR file</Link> · <PrintButton label={`Print all ${list?.length ?? 0} certificates`} /></p>
      {list?.length === 0 && <p className="muted">No training recorded yet.</p>}
      {list?.map((t) => <div key={t.id} className="cert-break"><Certificate t={t} name={person.full_name} employeeNo={person.staff_details?.employee_no ?? person.staff_details?.[0]?.employee_no} /></div>)}
    </main>
  );
}
