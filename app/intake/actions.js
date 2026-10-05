'use server';
// Intake portal (managers): cases, sending form links, cancelling / renewing links.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { formByKey } from '@/lib/intakeForms';

const text = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
const newToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');

export async function createCase(fd) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const { data, error } = await supabase.from('intake_cases').insert({
    person_name: text(fd, 'person_name'), stream: text(fd, 'stream'), home_id: text(fd, 'home_id'),
    referral_date: text(fd, 'referral_date'), notes: text(fd, 'notes'),
  }).select('id').single();
  if (error) redirect(`/intake?error=${encodeURIComponent(error.message)}`);
  redirect(`/intake/${data.id}`);
}

export async function updateCase(fd) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const id = text(fd, 'id');
  const { error } = await supabase.from('intake_cases').update({
    status: text(fd, 'status'), home_id: text(fd, 'home_id'), notes: text(fd, 'notes'),
  }).eq('id', id);
  if (error) redirect(`/intake/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/intake/${id}`); revalidatePath('/intake');
  redirect(`/intake/${id}?ok=${encodeURIComponent('Saved.')}`);
}

export async function sendForms(fd) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const caseId = text(fd, 'case_id');
  const keys = fd.getAll('form').filter((k) => formByKey(k));
  const name = text(fd, 'recipient_name');
  const email = text(fd, 'recipient_email');
  const back = (m, ok) => redirect(`/intake/${caseId}?${ok ? 'ok' : 'error'}=${encodeURIComponent(m)}#send`);
  if (!name) back('Enter who the forms are for.');
  if (keys.length === 0) back('Tick at least one form.');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back('That email address doesn’t look right.');
  const rows = keys.map((k) => ({
    case_id: caseId, form_key: k, form_title: formByKey(k).title, recipient_name: name,
    recipient_email: email ? email.toLowerCase() : null, recipient_role: text(fd, 'recipient_role'), token: newToken(),
    require_code: !!email && fd.get('require_code') === 'on',
  }));
  const { error } = await supabase.from('intake_requests').insert(rows);
  if (error) back(error.message);
  revalidatePath(`/intake/${caseId}`);
  back(`${rows.length} form link${rows.length > 1 ? 's' : ''} ready for ${name}. Now press “📧 Email” next to their name to send them.`, true);
}

// Manager fills an internal form (Admission Decision Record) themselves.
export async function fillInternal(fd) {
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const caseId = text(fd, 'case_id');
  const key = text(fd, 'form') ?? 'admission_decision';
  const token = newToken();
  const { error } = await supabase.from('intake_requests').insert({
    case_id: caseId, form_key: key, form_title: formByKey(key).title, recipient_name: profile.full_name,
    recipient_role: 'Program Manager', token, require_code: false,
  });
  if (error) redirect(`/intake/${caseId}?error=${encodeURIComponent(error.message)}`);
  redirect(`/f/${token}`);
}

export async function cancelRequest(fd) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const id = text(fd, 'id'); const caseId = text(fd, 'case_id');
  const { error } = await supabase.from('intake_requests').update({ status: 'Cancelled' }).eq('id', id).neq('status', 'Completed');
  if (error) redirect(`/intake/${caseId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/intake/${caseId}`);
}

// New link (old one stops working) and 21 more days.
export async function renewRequest(fd) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const id = text(fd, 'id'); const caseId = text(fd, 'case_id');
  const { error } = await supabase.from('intake_requests').update({
    token: newToken(), status: 'Sent', opened_at: null, sent_at: new Date().toISOString(),
    verified_at: null, session_hash: null, otp_hash: null, otp_sent_at: null, otp_attempts: 0,
    expires_at: new Date(Date.now() + 21 * 86400000).toISOString(),
  }).eq('id', id).neq('status', 'Completed');
  if (error) redirect(`/intake/${caseId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/intake/${caseId}`);
  redirect(`/intake/${caseId}?ok=${encodeURIComponent('New link made — the old link no longer works. Email it again.')}`);
}
