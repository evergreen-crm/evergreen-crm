'use server';
// Offer letters: HR creates (or uploads) the letter, sends it to sign (Evergreen's signature is added automatically),
// the person accepts in the portal (their saved signature is applied automatically), and anyone on the letter can
// email themselves a copy. The database enforces who can do what (supabase/offer-letters.sql).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/auth';
import { canHR } from '@/lib/levels';
import { sendEmail, emailReady } from '@/lib/email';
import { offerHtml } from '@/lib/offerLetter';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const go = (path, msg, bad) => redirect(`${path}${path.includes('?') ? '&' : '?'}${bad ? 'error' : 'ok'}=${encodeURIComponent(msg)}`);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createOffer(fd) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const pid = text(fd, 'profile_id');
  const back = `/hr/${pid}`;
  if (!canHR(profile)) go(back, 'Only HR or a Program Manager and above can create offer letters.', true);
  const wage = text(fd, 'wage');
  const row = {
    profile_id: pid, position: text(fd, 'position'), program: text(fd, 'program'), employment_type: text(fd, 'employment_type'),
    wage: wage ? Number(wage) : null, wage_unit: text(fd, 'wage_unit') === 'year' ? 'year' : 'hour', hours: text(fd, 'hours'),
    start_date: text(fd, 'start_date'), house: text(fd, 'house'), reports_to: text(fd, 'reports_to'),
    respond_by: text(fd, 'respond_by'), extra_terms: text(fd, 'extra_terms'), created_by: user.id,
  };
  if (!row.position) go(back, 'Enter the position.', true);
  const { data, error } = await supabase.from('offer_letters').insert(row).select('id').single();
  if (error) go(back, error.message, true);
  if (fd.get('send_now') === '1') {
    const { error: e2 } = await supabase.rpc('send_offer', { p_id: data.id });
    if (e2) go(`/offer/${data.id}`, e2.message, true);
    await notifyByEmail(supabase, data.id);
    revalidatePath(back);
    go(`/offer/${data.id}`, 'Offer letter created, signed for Evergreen and sent. They can sign it in the portal.');
  }
  revalidatePath(back);
  go(`/offer/${data.id}`, 'Offer letter created as a draft. Check it, then press “Send to sign”.');
}

// Called after HR uploads their own offer letter file to staff-files/<person>/.
export async function attachOfferFile({ id, path, name }) {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!canHR(profile)) return { error: 'HR or Program Manager and above only.' };
  const { data, error } = await supabase.from('offer_letters').update({ file_path: path, file_name: name }).eq('id', id).eq('status', 'Draft').select('id');
  if (error || !data?.length) return { error: error?.message ?? 'Only a draft offer can have its file changed.' };
  revalidatePath(`/offer/${id}`);
  return { ok: true };
}

export async function sendOffer(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(fd, 'id');
  const { error } = await supabase.rpc('send_offer', { p_id: id });
  if (error) go(`/offer/${id}`, error.message, true);
  const mailed = await notifyByEmail(supabase, id);
  revalidatePath(`/offer/${id}`);
  go(`/offer/${id}`, `Sent — Evergreen’s signature was added automatically.${mailed ? ' An email with the link was sent to them too.' : ' They will see it in their portal notifications.'}`);
}

export async function withdrawOffer(fd) {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(fd, 'id');
  if (!canHR(profile)) go(`/offer/${id}`, 'Only HR or a Program Manager and above can withdraw an offer.', true);
  const { data, error } = await supabase.from('offer_letters').update({ status: 'Withdrawn', withdrawn_at: new Date().toISOString() })
    .eq('id', id).in('status', ['Draft', 'Sent']).select('id');
  if (error || !data?.length) go(`/offer/${id}`, error?.message ?? 'This offer can no longer be withdrawn.', true);
  revalidatePath(`/offer/${id}`);
  go(`/offer/${id}`, 'Offer withdrawn.');
}

export async function acceptOffer(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(fd, 'id');
  if (fd.get('agree') !== 'on') go(`/offer/${id}`, 'Tick the box to confirm you accept the offer.', true);
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || null;
  const { error } = await supabase.rpc('accept_offer', { p_id: id, p_name: text(fd, 'signed_name'), p_ip: ip, p_agent: h.get('user-agent') });
  if (error) go(`/offer/${id}`, error.message, true);
  revalidatePath(`/offer/${id}`); revalidatePath('/onboarding');
  go(`/offer/${id}`, 'Thank you — you accepted the offer. Your signed offer letter is saved in your portal. Welcome to Evergreen!');
}

export async function declineOffer(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(fd, 'id');
  const { error } = await supabase.rpc('decline_offer', { p_id: id, p_reason: text(fd, 'reason') });
  if (error) go(`/offer/${id}`, error.message, true);
  revalidatePath(`/offer/${id}`);
  go(`/offer/${id}`, 'You declined the offer. HR has been told.');
}

// Email a copy of the letter to the person's own email address (or another address they type).
export async function emailOffer(fd) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(fd, 'id');
  const to = text(fd, 'to');
  if (!to || !EMAIL_RE.test(to)) go(`/offer/${id}`, 'Enter a valid email address.', true);
  if (!emailReady()) go(`/offer/${id}`, 'Email sending isn’t set up yet (RESEND_API_KEY in Vercel). Use “Print / Save as PDF” instead.', true);
  const { data: o } = await supabase.from('offer_letters').select('*, profiles!offer_letters_profile_id_fkey(full_name)').eq('id', id).maybeSingle();
  if (!o) go(`/offer/${id}`, 'Offer not found.', true);
  const origin = await siteOrigin();
  const html = `<p>Hello,</p><p>Here is a copy of ${o.status === 'Accepted' ? 'the signed' : 'the'} Evergreen Community Care offer letter for ${o.profiles?.full_name ?? 'you'}. The original is saved in the portal: <a href="${origin}/offer/${id}">${origin}/offer/${id}</a></p><hr>` + offerHtml(o, { personName: o.profiles?.full_name ?? '', forEmail: true });
  const res = await sendEmail({ to, subject: `Evergreen offer letter — ${o.position}${o.status === 'Accepted' ? ' (signed)' : ''}`, html });
  if (res.error) go(`/offer/${id}`, res.error, true);
  go(`/offer/${id}`, `A copy was emailed to ${to}.`);
}

async function siteOrigin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return `${h.get('x-forwarded-proto') ?? 'https'}://${host}`;
}

// When an offer is sent, also email the person a link (if email is set up and they have an address).
async function notifyByEmail(supabase, id) {
  if (!emailReady()) return false;
  const { data: o } = await supabase.from('offer_letters').select('id, position, profiles!offer_letters_profile_id_fkey(full_name, email)').eq('id', id).maybeSingle();
  const to = o?.profiles?.email;
  if (!to) return false;
  const origin = await siteOrigin();
  const res = await sendEmail({
    to, subject: 'Your Evergreen offer letter is ready to sign',
    html: `<p>Hello ${o.profiles.full_name},</p><p>Evergreen Community Care has sent you an offer of employment as <strong>${o.position}</strong>.</p><p><a href="${origin}/offer/${id}">Sign in to the portal to read and sign it</a>.</p>`,
  });
  return !res.error;
}
