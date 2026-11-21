'use server';
import { fail } from '@/lib/fail';
// Resident consents (supabase/resident-consents.sql). A renewal is a new row; the old one stays on record.
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null; };

export async function addConsent(fd) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const residentId = text(fd, 'resident_id');
  const signed = text(fd, 'signed_on');
  const expires = text(fd, 'expires_on');
  if (!signed || !expires) await fail('Write the date it was signed and the date it expires.');
  if (expires < signed) await fail('The expiry date is before the signed date.');
  const { error } = await supabase.from('resident_consents').insert({
    resident_id: residentId,
    kind: text(fd, 'kind'),
    shared_with: text(fd, 'shared_with'),
    signed_on: signed,
    expires_on: expires,
    signed_by: text(fd, 'signed_by'),
    note: text(fd, 'note'),
    created_by: user.id,
  });
  if (error) await fail('Could not save the consent: ' + error.message);
  revalidatePath(`/residents/${residentId}`);
}
