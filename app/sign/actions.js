'use server';
// Send for signature: every change goes through the database functions in supabase/sign-requests.sql
// and supabase/sign-external.sql, which check who may do what. These actions pass the values on,
// email outside signers their private link, and make the finished PDF when everyone has answered.
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { plainError } from '@/lib/plain';
import { emailInvites, outsideReady } from '@/lib/signEmail';
import { finishRequest } from '@/lib/signFinish';

const err = (e) => ({ error: plainError(e?.message ?? String(e)) });
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);

function cleanFields(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 300).map((f) => ({
    id: str(f?.id, 40), type: str(f?.type, 20), who: str(f?.who, 200), page: Math.max(0, Math.min(999, Math.floor(Number(f?.page) || 0))),
    rect: Array.isArray(f?.rect) ? f.rect.slice(0, 4).map(num) : [], label: str(f?.label, 80) || null, required: f?.required !== false,
  }));
}

export async function sendForSignature(p) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const signers = Array.isArray(p?.signers) ? [...new Set(p.signers.filter((x) => typeof x === 'string'))] : [];
  const external = Array.isArray(p?.external) ? p.external.slice(0, 25).map((e) => ({
    name: str(e?.name, 120), email: str(e?.email, 160).toLowerCase(), role: str(e?.role, 120), org: str(e?.org, 160), phone: str(e?.phone, 40), notes: str(e?.notes, 1000),
  })) : [];
  // On a PDF, everyone signing must have a Signature box, so they know exactly where to sign.
  const fields = cleanFields(p?.fields);
  if (/\.pdf$/i.test(String(p?.file_name ?? '')) || /pdf/i.test(String(p?.file_type ?? ''))) {
    const keys = [...signers.map((x) => `p:${x}`), ...external.map((e) => `e:${e.email}`)];
    const missing = keys.filter((k) => !fields.some((f) => f.who === k && f.type === 'signature'));
    if (missing.length) return { error: 'Mark where each person signs: every person needs a ✍️ Signature box on the document.' };
  }
  if (external.length && !outsideReady()) return { error: 'Email isn’t set up yet, so documents can’t be sent to outside people. Ask the administrator (RESEND_API_KEY and the Supabase secret key in Vercel).' };
  const { data, error } = await supabase.rpc('sign_send', {
    p_title: str(p?.title, 200), p_category: str(p?.category, 80) || 'Other',
    p_message: p?.message ? String(p.message).slice(0, 4000) : null,
    p_file_path: p?.file_path, p_file_name: String(p?.file_name ?? '').slice(0, 200), p_file_type: p?.file_type ?? null,
    p_file_size: Number(p?.file_size) || null, p_doc_hash: p?.doc_hash ?? null,
    p_due: /^\d{4}-\d{2}-\d{2}$/.test(p?.due ?? '') ? p.due : null, p_signers: signers,
    p_external: external, p_fields: fields, p_home: /^[0-9a-f-]{36}$/i.test(p?.home ?? '') ? p.home : null,
  });
  if (error) return err(error);
  const failed = await emailInvites(data?.invites ?? [], { title: str(p?.title, 200), sender: data?.sender, due: p?.due || null, message: p?.message ? String(p.message).slice(0, 4000) : null });
  revalidatePath('/sign');
  return { ok: true, id: data?.id, failed };
}

export async function markViewed(id) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  await supabase.rpc('sign_viewed', { p_request: id });
}

export async function signDocument({ id, name, image, agent, values }) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('sign_sign', {
    p_request: id, p_name: String(name ?? '').slice(0, 120), p_image: image, p_agent: String(agent ?? '').slice(0, 300),
    p_values: values && typeof values === 'object' ? values : {},
  });
  if (error) return err(error);
  if (data?.completed) await finishRequest(id);
  revalidatePath(`/sign/${id}`); revalidatePath('/sign'); revalidatePath('/todo');
  return { ok: true };
}

export async function declineDocument({ id, reason }) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('sign_decline', { p_request: id, p_reason: String(reason ?? '').slice(0, 1000) });
  if (error) return err(error);
  if (data?.completed) await finishRequest(id);
  revalidatePath(`/sign/${id}`); revalidatePath('/sign'); revalidatePath('/todo');
  return { ok: true };
}

export async function remindSigners(id) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('sign_remind', { p_request: id });
  if (error) return err(error);
  const failed = await emailInvites(data?.invites ?? [], { title: data?.title, sender: data?.sender, due: data?.due, reminder: true });
  revalidatePath(`/sign/${id}`);
  return { ok: true, count: data?.count ?? 0, failed };
}

export async function cancelRequest({ id, reason }) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.rpc('sign_cancel', { p_request: id, p_reason: String(reason ?? '').slice(0, 500) });
  if (error) return err(error);
  revalidatePath(`/sign/${id}`); revalidatePath('/sign');
  return { ok: true };
}

// Make the finished PDF again (e.g. if it failed the first time). Only people who can see the request.
export async function remakeFinished(id) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data: ok } = await supabase.rpc('can_manage_sign_request', { rid: id });
  if (!ok) return { error: 'Only the sender or a manager at this house can do that.' };
  const res = await finishRequest(id);
  revalidatePath(`/sign/${id}`);
  return res;
}
