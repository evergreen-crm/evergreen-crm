'use server';
// Send for signature: every change goes through the database functions in supabase/sign-requests.sql,
// which check who may do what. These actions only pass the values on and refresh the pages.
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { plainError } from '@/lib/plain';

const err = (e) => ({ error: plainError(e?.message ?? String(e)) });

export async function sendForSignature(p) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const signers = Array.isArray(p?.signers) ? [...new Set(p.signers.filter((x) => typeof x === 'string'))] : [];
  const { data, error } = await supabase.rpc('sign_send', {
    p_title: String(p?.title ?? '').slice(0, 200), p_category: String(p?.category ?? 'Other').slice(0, 80),
    p_message: p?.message ? String(p.message).slice(0, 4000) : null,
    p_file_path: p?.file_path, p_file_name: String(p?.file_name ?? '').slice(0, 200), p_file_type: p?.file_type ?? null,
    p_file_size: Number(p?.file_size) || null, p_doc_hash: p?.doc_hash ?? null,
    p_due: /^\d{4}-\d{2}-\d{2}$/.test(p?.due ?? '') ? p.due : null, p_signers: signers,
  });
  if (error) return err(error);
  revalidatePath('/sign');
  return { ok: true, id: data };
}

export async function markViewed(id) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  await supabase.rpc('sign_viewed', { p_request: id });
}

export async function signDocument({ id, name, image, agent }) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.rpc('sign_sign', { p_request: id, p_name: String(name ?? '').slice(0, 120), p_image: image, p_agent: String(agent ?? '').slice(0, 300) });
  if (error) return err(error);
  revalidatePath(`/sign/${id}`); revalidatePath('/sign'); revalidatePath('/todo');
  return { ok: true };
}

export async function declineDocument({ id, reason }) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.rpc('sign_decline', { p_request: id, p_reason: String(reason ?? '').slice(0, 1000) });
  if (error) return err(error);
  revalidatePath(`/sign/${id}`); revalidatePath('/sign'); revalidatePath('/todo');
  return { ok: true };
}

export async function remindSigners(id) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('sign_remind', { p_request: id });
  if (error) return err(error);
  revalidatePath(`/sign/${id}`);
  return { ok: true, count: data ?? 0 };
}

export async function cancelRequest({ id, reason }) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.rpc('sign_cancel', { p_request: id, p_reason: String(reason ?? '').slice(0, 500) });
  if (error) return err(error);
  revalidatePath(`/sign/${id}`); revalidatePath('/sign');
  return { ok: true };
}
