// Edit a resident's full profile.
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import ResidentForm from '@/app/residents/ResidentForm';
import { updateResident } from '@/app/homes/actions';

export default async function EditResidentPage({ params }) {
  const { id } = await params;
  const { supabase } = await requireUser(['admin', 'manager']);
  const [{ data: resident }, { data: homes }] = await Promise.all([
    supabase.from('residents').select('*').eq('id', id).maybeSingle(),
    supabase.from('homes').select('id, name').order('name'),
  ]);
  if (!resident) notFound();
  return (
    <main>
      <h1>Edit {resident.first_name} {resident.last_name}</h1>
      <ResidentForm action={updateResident} resident={resident} homes={homes}
        cancelHref={`/residents/${id}`} />
    </main>
  );
}
