'use server';
// Save a reference (public link, no account). The link's token is the permission; uses the server key.
import { headers } from 'next/headers';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { REF_FORM } from '@/lib/referenceForm';
import { onReferenceCompleted } from '@/lib/references';

const validToken = (t) => typeof t === 'string' && /^[0-9a-f]{40,80}$/i.test(t);
const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export async function submitReference(token, raw) {
  if (!validToken(token) || !adminKey()) return { error: 'This link is not valid.' };
  const admin = createAdminClient();
  const { data: r } = await admin.from('reference_requests').select('*').eq('token', token).maybeSingle();
  if (!r) return { error: 'This link is not valid.' };
  if (r.status === 'Completed') return { error: 'This reference was already received. Thank you!' };
  if (!['Sent', 'Opened'].includes(r.status) || new Date(r.expires_at) < new Date()) return { error: 'This link has closed. Please reply to the email and our HR team will contact you.' };

  const a = {
    supervised: raw?.supervised === 'yes' ? 'yes' : raw?.supervised === 'no' ? 'no' : '',
    relationship: s(raw?.relationship, 200), your_title: s(raw?.your_title, 160), agency: s(raw?.agency, 200),
    position: s(raw?.position, 200), from: s(raw?.from, 20), to: s(raw?.to, 20),
    rehire: ['Yes', 'No', 'Unsure / policy'].includes(raw?.rehire) ? raw.rehire : '',
    concern: raw?.concern === 'yes' ? 'yes' : raw?.concern === 'no' ? 'no' : '', concern_detail: s(raw?.concern_detail, 2000),
    comments: s(raw?.comments, 3000),
  };
  for (const [k] of REF_FORM.ratings) { const n = Number(raw?.[`r_${k}`]); a[`r_${k}`] = n >= 1 && n <= 5 ? n : null; }
  for (const [k] of REF_FORM.text) a[k] = s(raw?.[k], 2000);
  const signed = s(raw?.signed_name, 120);
  const errs = [];
  if (!a.supervised) errs.push('Please say whether you supervised this person.');
  if (!a.your_title || !a.agency) errs.push('Please give your job title and agency.');
  if (!a.from) errs.push('Please give the start date (month and year is fine).');
  if (!a.rehire) errs.push('Please answer “Would you rehire?”.');
  if (!a.concern) errs.push('Please answer the safety question.');
  if (a.concern === 'yes' && a.concern_detail.length < 3) errs.push('Please tell us about your concern.');
  if (signed.length < 3 || raw?.truthful !== true) errs.push('Please confirm and type your full name.');
  if (errs.length) return { error: errs.join(' ') };

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const patch = { status: 'Completed', completed_at: new Date().toISOString(), answers: a, confirms_supervised: a.supervised === 'yes',
    rehire: a.rehire, concern: a.concern === 'yes', signed_name: signed, signer_ip: ip };
  const { data: done, error } = await admin.from('reference_requests').update(patch).eq('id', r.id).in('status', ['Sent', 'Opened']).select('*').maybeSingle();
  if (error || !done) return { error: 'Could not save. Please try again.' };
  try { await onReferenceCompleted(admin, done); } catch {}
  return { ok: true };
}
