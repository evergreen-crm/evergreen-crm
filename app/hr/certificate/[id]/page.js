// Printable Evergreen certificate of completion for one training record.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import Certificate from '@/app/hr/Certificate';
import PrintButton from '@/app/PrintButton';

export default async function CertificatePage({ params }) {
  const { id } = await params;
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data: t } = await supabase.from('trainings')
    .select('*, person:profile_id(full_name, staff_details(employee_no)), verifier:verified_by(full_name)').eq('id', id).maybeSingle();
  if (!t) notFound();
  return (
    <main className="cert-page">
      <style>{'@page { size: landscape; margin: 10mm; }'}</style>
      <p className="no-print small"><Link href={`/hr/${t.profile_id}`}>← {t.person?.full_name}’s HR file</Link> · <PrintButton label="Print certificate" /></p>
      {!t.verified_by && <p className="alert no-print">This training is waiting for a manager to verify it. The certificate is marked “not verified” until then.</p>}
      <Certificate t={t} name={t.person?.full_name ?? ''} employeeNo={t.person?.staff_details?.employee_no ?? t.person?.staff_details?.[0]?.employee_no} />
    </main>
  );
}
