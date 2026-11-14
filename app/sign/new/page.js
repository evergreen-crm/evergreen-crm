// Send a document for signature: the file, who signs (staff and outside people), boxes on the page, due date.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canSend, canSendAnyHouse, SIGN_CATEGORIES } from '@/lib/sign';
import { personLabel } from '@/lib/levels';
import { todayISO, addDaysISO } from '@/lib/options';
import { outsideReady } from '@/lib/signEmail';
import SendForm from './SendForm';

export const dynamic = 'force-dynamic';

export default async function NewSignRequest({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!canSend(profile)) redirect('/sign?error=' + encodeURIComponent('Only Program Coordinators, Program Managers and Directors can send documents for signature.'));
  const any = canSendAnyHouse(profile);
  if (!any && !profile.home_id) redirect('/sign?error=' + encodeURIComponent('You need a house on your profile to send documents. Ask the office.'));
  let q = supabase.from('profiles').select('id, full_name, role, level, staff_group, home_id, homes(name)').eq('active', true).neq('role', 'family').order('full_name');
  if (!any) q = q.eq('home_id', profile.home_id);
  const [{ data: people }, { data: homes }] = await Promise.all([q, any ? supabase.from('homes').select('id, name').order('name') : Promise.resolve({ data: [] })]);
  const list = (people ?? []).filter((p) => p.id !== profile.id).map((p) => ({ id: p.id, name: p.full_name, house: p.homes?.name ?? 'No house', role: personLabel(p) }));
  let preset = typeof sp.to === 'string' ? sp.to.split(',').filter((x) => list.some((p) => p.id === x)) : [];
  // ?offer=<id>: an offer letter already uploaded to a staff file (Job page). The database decides who can read it.
  let prefill = null;
  if (typeof sp.offer === 'string') {
    const { data: u } = await supabase.from('offer_uploads').select('id, profile_id, version, file_path, file_name, person:profile_id(full_name)').eq('id', sp.offer).maybeSingle();
    const { data: link } = u ? await supabase.storage.from('staff-files').createSignedUrl(u.file_path, 900) : { data: null };
    if (u && link?.signedUrl) {
      prefill = { url: link.signedUrl, name: u.file_name, title: `Offer letter (version ${u.version}) — ${u.person?.full_name ?? ''}`.trim(), category: 'Contract or job change' };
      if (list.some((p) => p.id === u.profile_id)) preset = [u.profile_id];
    }
  }
  return (
    <main>
      <p className="small"><Link href="/sign">← Signatures</Link></p>
      <h1>✍️ Send a document for signature</h1>
      <p className="muted">Send to staff (they get an alert and a to-do item) or to anyone with an email, like a social worker or doctor.
        On a PDF you can place boxes where each person signs, initials, writes or ticks. When everyone is done, you get one finished PDF with a signing certificate.
        {!any && ' You can send to staff at your own house; it is filed under your house.'}</p>
      <SendForm people={list} categories={SIGN_CATEGORIES} preset={preset} minDue={todayISO()} defaultDue={addDaysISO(todayISO(), 7)} userId={profile.id}
        outsideOk={outsideReady()} houses={homes ?? []} defaultHouse={profile.home_id ?? ''} pickHouse={any} prefill={prefill} />
      {typeof sp.offer === 'string' && !prefill && <p className="message">That offer letter could not be opened from here. Choose the file below instead.</p>}
    </main>
  );
}
