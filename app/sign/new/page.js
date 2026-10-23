// Send a document for signature: choose the file, who signs, and when it's due.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canSend, canManageAll, SIGN_CATEGORIES } from '@/lib/sign';
import { personLabel } from '@/lib/levels';
import { todayISO, addDaysISO } from '@/lib/options';
import SendForm from './SendForm';

export const dynamic = 'force-dynamic';

export default async function NewSignRequest({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!canSend(profile)) redirect('/sign');
  const all = canManageAll(profile);
  let q = supabase.from('profiles').select('id, full_name, role, level, staff_group, home_id, homes(name)').eq('active', true).neq('role', 'family').order('full_name');
  if (!all) q = q.eq('home_id', profile.home_id ?? '00000000-0000-0000-0000-000000000000');
  const { data: people } = await q;
  const list = (people ?? []).filter((p) => p.id !== profile.id).map((p) => ({ id: p.id, name: p.full_name, house: p.homes?.name ?? 'No house', role: personLabel(p) }));
  const preset = typeof sp.to === 'string' ? sp.to.split(',').filter((x) => list.some((p) => p.id === x)) : [];
  return (
    <main>
      <p className="small"><Link href="/sign">← Signatures</Link></p>
      <h1>✍️ Send a document for signature</h1>
      <p className="muted">Each person gets an alert and a to-do item. They open the document, confirm they read it, type their name and draw their signature — or say why they won’t sign.
        {!all && ' You can send to staff at your own house.'}</p>
      {!list.length ? <p className="card">There’s nobody you can send to yet.</p> : (
        <SendForm people={list} categories={SIGN_CATEGORIES} preset={preset} minDue={todayISO()} defaultDue={addDaysISO(todayISO(), 7)} userId={profile.id} />
      )}
    </main>
  );
}
