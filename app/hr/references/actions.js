'use server';
// 📨 Reference checks — HR buttons: send now, resend (optionally to a corrected email), cancel.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePrescreen } from '@/lib/prescreenAuth';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { createReferenceRequests, resendReference, cleanRefs } from '@/lib/references';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const safeBack = (fd) => { const b = text(fd, 'back') ?? '/hr'; return b.startsWith('/hr/') ? b : '/hr'; };
const go = (fd, m, ok) => { const b = safeBack(fd); redirect(`${b}${b.includes('?') ? '&' : '?'}${ok ? 'ok' : 'error'}=${encodeURIComponent(m)}#references`); };

// Older applications (before automatic emails): send the forms to the references the applicant gave.
export async function sendPrescreenRefs(fd) {
  const { profile } = await requirePrescreen();
  if (!adminKey()) go(fd, 'The server key is not set.');
  const admin = createAdminClient();
  const { data: p } = await admin.from('prescreens').select('id, first_name, last_name, position, application, link_status').eq('id', text(fd, 'prescreen_id')).maybeSingle();
  if (!p?.application?.refs) go(fd, 'The applicant hasn’t given references yet.');
  const r = await createReferenceRequests(admin, { prescreenId: p.id, aboutName: `${p.first_name} ${p.last_name ?? ''}`.trim(), position: p.position, refs: cleanRefs(p.application.refs), createdBy: profile.id });
  revalidatePath(safeBack(fd).split('?')[0]);
  go(fd, `${r.sent} reference form(s) emailed${r.kept ? `, ${r.kept} already sent` : ''}${r.failed ? `, ${r.failed} could not be sent (missing or wrong email — phone them)` : ''}.`, r.failed === 0);
}

export async function resendRef(fd) {
  await requirePrescreen();
  if (!adminKey()) go(fd, 'The server key is not set.');
  const r = await resendReference(createAdminClient(), text(fd, 'id'), text(fd, 'email'));
  revalidatePath(safeBack(fd).split('?')[0]);
  if (r.error) go(fd, r.error);
  go(fd, 'Reference form sent again with a new 21-day link.', true);
}

export async function cancelRef(fd) {
  await requirePrescreen(['admin', 'hr']);
  if (!adminKey()) go(fd, 'The server key is not set.');
  await createAdminClient().from('reference_requests').update({ status: 'Cancelled' }).eq('id', text(fd, 'id')).in('status', ['Sent', 'Opened', 'Not sent', 'Expired']);
  revalidatePath(safeBack(fd).split('?')[0]);
  go(fd, 'Reference request cancelled. Phone the reference instead, or resend.', true);
}
