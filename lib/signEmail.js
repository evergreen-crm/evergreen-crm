// Emails for outside signers (social workers, doctors...): the private link, and the finished copy.
import 'server-only';
import { headers } from 'next/headers';
import { sendEmail, emailReady } from '@/lib/email';
import { adminKey } from '@/lib/supabase/admin';
import { fmtDate } from '@/lib/options';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const outsideReady = () => emailReady() && !!adminKey();

export async function siteOrigin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) return `${h.get('x-forwarded-proto') ?? 'https'}://${host}`;
  return (process.env.SITE_URL || 'https://evergreen-crm-azure.vercel.app').replace(/\/$/, '');
}

const shell = (inner) => `<div style="font-family:Arial,sans-serif;color:#1d2420;max-width:540px;line-height:1.45">${inner}
  <p style="color:#6a736d;font-size:12px;margin-top:24px">Evergreen Community Care Inc. · This message was sent on behalf of the person named above. If you weren’t expecting it, you can ignore it or reply to let us know.</p></div>`;

// One email per outside person with their own private link. Returns the addresses that failed.
export async function emailInvites(invites, { title, sender, due, message, reminder = false }) {
  if (!invites?.length) return [];
  const origin = await siteOrigin();
  const failed = [];
  for (const inv of invites) {
    const link = `${origin}/f/sign/${inv.token}`;
    const subject = `${reminder ? 'Reminder: ' : ''}Please sign: ${title} — Evergreen Community Care`;
    const html = shell(`<p>Hello ${esc(inv.name)},</p>
      <p>${esc(sender ?? 'Evergreen Community Care')} at Evergreen Community Care ${reminder ? 'is still waiting for' : 'sent you'} a document to read and sign: <strong>${esc(title)}</strong>${due ? `, by ${esc(fmtDate(due))}` : ''}.</p>
      ${message && !reminder ? `<p style="white-space:pre-wrap;background:#f3f6f4;padding:10px;border-radius:6px">${esc(message)}</p>` : ''}
      <p style="margin:22px 0"><a href="${link}" style="background:#0b5a34;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Open and sign</a></p>
      <p style="font-size:13px">To keep it private, we’ll email you a 6-digit code when you open the link. No account or password is needed.</p>
      <p style="font-size:12px;color:#6a736d">If the button doesn’t work, copy this link: ${link}</p>`);
    const text = `Hello ${inv.name},\n\n${sender ?? 'Evergreen Community Care'} at Evergreen Community Care ${reminder ? 'is still waiting for' : 'sent you'} a document to read and sign: ${title}${due ? `, by ${fmtDate(due)}` : ''}.\n\nOpen and sign: ${link}\n\nWe'll email you a 6-digit code when you open the link. No account is needed.\n\nEvergreen Community Care`;
    const res = await sendEmail({ to: inv.email, subject, html, text });
    if (res.error) failed.push(inv.email);
  }
  return failed;
}

// After everyone answered: email each outside person who signed a copy of the finished PDF.
export async function emailFinishedCopies({ request, signers, bytes }) {
  if (!emailReady()) return;
  const outside = signers.filter((s) => !s.profile_id && s.status === 'Signed' && s.ext_email);
  if (!outside.length || !bytes) return;
  const content = Buffer.from(bytes).toString('base64');
  if (content.length > 20_000_000) return; // too big to attach; they can download it from their link
  const filename = `${String(request.title).replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'document'} - signed.pdf`;
  for (const s of outside) {
    await sendEmail({
      to: s.ext_email, subject: `Signed copy: ${request.title} — Evergreen Community Care`,
      html: shell(`<p>Hello ${esc(s.ext_name)},</p><p>Everyone has now answered <strong>${esc(request.title)}</strong>. Your copy of the finished document is attached, with a signing certificate on the last page.</p><p>Thank you.</p>`),
      text: `Hello ${s.ext_name},\n\nEveryone has now answered "${request.title}". Your copy of the finished document is attached, with a signing certificate on the last page.\n\nThank you,\nEvergreen Community Care`,
      attachments: [{ filename, content }],
    });
  }
}
