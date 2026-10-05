// Sends email through Resend (resend.com). Needs RESEND_API_KEY in Vercel (never in the code).
import 'server-only';

export const emailReady = () => !!process.env.RESEND_API_KEY;

export async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) return { error: 'Email sending is not set up yet.' };
  const from = process.env.EMAIL_FROM || 'Evergreen Community Care <no-reply@evergreencommunitycare.com>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.message ?? ''; } catch {}
    return { error: `Email could not be sent${detail ? `: ${detail}` : ''}.` };
  }
  return { ok: true };
}
