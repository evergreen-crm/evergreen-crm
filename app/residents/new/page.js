// Add a new resident.
import { requireUser } from '@/lib/auth';
import ResidentForm from '@/app/residents/ResidentForm';
import { createResident } from '@/app/homes/actions';

export default async function NewResidentPage({ searchParams }) {
  const { home } = await searchParams;
  const { supabase } = await requireUser(['admin', 'manager']);
  const { data: homes } = await supabase.from('homes').select('id, name').order('name');
  return (
    <main>
      <h1>Add a resident</h1>
      <ResidentForm action={createResident} homes={homes} homeId={home}
        cancelHref={home ? `/homes/${home}` : '/homes'} />
    </main>
  );
}
