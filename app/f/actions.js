'use server';
// Public intake form: fill in and sign (no account needed — the private link is the key).
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { formByKey } from '@/lib/intakeForms';

export async function submitIntake(token, formKey, answers, signedName, signerRole, signature) {
  const form = formByKey(formKey);
  if (!form) return { error: 'This form could not be found.' };
  const clean = {};
  const missing = [];
  for (const s of form.sections) for (const f of s.fields) {
    let v = answers?.[f.name];
    if (f.type === 'check') v = v === true || v === 'on' || v === 'true';
    else v = typeof v === 'string' ? v.trim().slice(0, 5000) : '';
    if (f.required && (f.type === 'check' ? !v : !v)) missing.push(f.label);
    clean[f.name] = v;
  }
  if (missing.length) return { error: 'Please complete: ' + missing.slice(0, 5).join(', ') + (missing.length > 5 ? '…' : '') };
  if (!signedName?.trim()) return { error: 'Please type your full name to sign.' };
  if (!signature?.startsWith('data:image/png;base64,')) return { error: 'Please draw your signature in the box.' };

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || '';
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('intake_submit', {
    t: token, answers: clean, sname: signedName.trim().slice(0, 120), srole: (signerRole ?? '').slice(0, 80),
    sig: signature, ip, agent: h.get('user-agent') ?? '',
  });
  if (error) return { error: 'Could not save: ' + error.message };
  const msg = { ok: null, already: 'This form was already signed.', cancelled: 'This link was cancelled. Please contact Evergreen.',
    expired: 'This link has expired. Please ask Evergreen for a new one.', not_found: 'This link is not valid.',
    unsigned: 'Please type your name and draw your signature.', too_large: 'The form is too large — please shorten your answers.' }[data];
  if (msg) return { error: msg };
  return { ok: true };
}
