// Email the person a link when their offer letter has been sent to them to sign (best effort: never blocks the save).
import 'server-only';
import { headers } from 'next/headers';
import { sendEmail, emailReady } from '@/lib/email';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function emailOfferLink(id) {
  try {
    if (!id || !emailReady() || !adminKey()) return false;
    const { data: o } = await createAdminClient().from('offer_letters')
      .select('id, status, position, profiles!offer_letters_profile_id_fkey(full_name, email, active)').eq('id', id).maybeSingle();
    const to = o?.profiles?.email;
    if (!to || o.status !== 'Sent' || !o.profiles.active) return false;
    const h = await headers();
    const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
    const res = await sendEmail({
      to, subject: 'Your Evergreen offer letter is ready to sign',
      html: `<p>Hello ${esc(o.profiles.full_name)},</p><p>Evergreen Community Care has sent you an offer of employment as <strong>${esc(o.position)}</strong>.</p><p><a href="${origin}/offer/${id}">Sign in to the portal to read and sign it</a>.</p>`,
    });
    return !res.error;
  } catch { return false; }
}
