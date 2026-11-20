// Emails the applicant their private pre-screen link from the portal (no username or password; they open it with a
// 6-digit code sent to the same email). Used when HR adds an applicant, makes a new link, or opens a pre-screen
// from a Careers application.
import 'server-only';
import { sendEmail, emailReady } from '@/lib/email';
import { siteOrigin } from '@/lib/idcard';
import { fmtDate } from '@/lib/options';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function emailPrescreenLink(admin, id) {
  const { data: p } = await admin.from('prescreens')
    .select('id, first_name, email, token, link_status, expires_at, require_code, application_no, position, posting:posting_id(title, job_id)').eq('id', id).maybeSingle();
  if (!p) return { error: 'File not found.' };
  if (!p.email) return { error: 'No email address on the file.' };
  if (!['Sent', 'Opened'].includes(p.link_status)) return { error: 'The link is not open.' };
  if (!emailReady()) return { error: 'Email sending is not set up on this portal.' };
  const site = (process.env.SITE_URL || await siteOrigin()).replace(/\/$/, '');
  const url = `${site}/f/prescreen/${p.token}`;
  const job = p.posting ? `${p.posting.title} (Job ID ${p.posting.job_id})` : p.position ?? 'a position';
  const until = p.expires_at ? fmtDate(p.expires_at.slice(0, 10)) : '';
  const subject = `Your Evergreen pre-screen — ${p.application_no}`;
  const text = `Hello ${p.first_name},\n\nThank you for your interest in working with Evergreen Community Care (${job}). Your application number is ${p.application_no}.\n\nPlease open your private link to complete your pre-screen. You'll tick the requirements checklist, upload your resume and photos of your certificates, give three supervisor references, tell us when you're available for an interview, and sign. It takes about 15–20 minutes on a phone or computer, and you can save and come back.\n\n${url}\n\n${p.require_code ? 'When you open it, we email you a 6-digit code to confirm it is you. ' : ''}${until ? `The link works until ${until}.` : ''}\n\nEvergreen Community Care — HR`;
  const html = `<div style="font-family:Arial,sans-serif;color:#1d2420;max-width:560px;line-height:1.5">
    <p>Hello ${esc(p.first_name)},</p>
    <p>Thank you for your interest in working with Evergreen Community Care (${esc(job)}). Your application number is <strong>${esc(p.application_no)}</strong>.</p>
    <p>Please open your private link to complete your pre-screen. You’ll tick the requirements checklist, upload your resume and photos of your certificates, give three supervisor references, tell us when you’re available for an interview, and sign. It takes about 15–20 minutes on a phone or computer.</p>
    <p style="margin:22px 0"><a href="${url}" style="background:#0b5a34;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Open my pre-screen</a></p>
    <p style="font-size:13px">${p.require_code ? 'When you open it, we email you a 6-digit code to confirm it is you. ' : ''}${until ? `The link works until ${esc(until)}.` : ''}</p>
    <p style="font-size:12px;color:#6a736d">If the button doesn’t work, copy this link: ${url}<br>Evergreen Community Care — HR</p></div>`;
  const sent = await sendEmail({ to: p.email, subject, html, text });
  if (sent.error) return { error: sent.error };
  await admin.from('prescreens').update({ link_emailed_at: new Date().toISOString(), link_emailed_to: p.email }).eq('id', p.id);
  return { ok: true, to: p.email };
}
