// Everyone answered: fill in the PDF, add the certificate, and send outside signers their copy.
// Not a server action (no 'use server'), so it can only be run from our own server code after a check.
import 'server-only';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { buildFinishedPdf } from '@/lib/signPdf';
import { emailFinishedCopies } from '@/lib/signEmail';

// email: send outside signers their copy. Remaking the PDF by hand passes false, so nobody is emailed twice.
export async function finishRequest(id, { email = true } = {}) {
  if (!adminKey()) return { error: 'The Supabase secret key isn’t set up in Vercel, so the finished PDF can’t be made yet.' };
  try {
    const res = await buildFinishedPdf(createAdminClient(), id);
    if (res.ok && email) await emailFinishedCopies(res);
    return res.error ? { error: res.error } : { ok: true, skipped: !!res.skipped };
  } catch (e) {
    return { error: 'The finished PDF could not be made: ' + (e?.message ?? e) };
  }
}
