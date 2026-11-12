'use server';
// Witness a policy sign-off record. The database decides who may witness (can_witness_policy_record):
// the person's house leaders, directors or the Administrator, never the person themself.
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { witnessPolicyRecord } from '@/lib/policyRecords';

const norm = (v) => (v ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

export async function witnessRecord({ id, name, image, checked }) {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!adminKey()) return { error: 'The Supabase secret key isn’t set up in Vercel, so the record can’t be signed yet.' };
  if (checked !== true) return { error: 'Please tick the box to confirm you checked each signed copy.' };
  if (!norm(name) || norm(name) !== norm(profile.full_name)) return { error: `To sign, type your full name exactly as it is on your account: "${profile.full_name}".` };
  if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length < 200) return { error: 'Please draw your signature.' };
  if (image.length > 400000) return { error: 'The signature picture is too big. Please clear it and draw again.' };
  const { data: rec } = await supabase.from('policy_records').select('id, profile_id, status').eq('id', id).maybeSingle();
  if (!rec) return { error: 'You can’t open this record.' };
  const { data: ok } = await supabase.rpc('can_witness_policy_record', { p: rec.profile_id });
  if (ok !== true) return { error: 'Only this person’s Program Coordinator, Program Manager, a director or the Administrator can witness this record.' };
  const res = await witnessPolicyRecord(createAdminClient(), id, profile, { name, image });
  if (res.error) return { error: res.error };
  revalidatePath('/policies/records'); revalidatePath(`/policies/records/${id}`); revalidatePath('/action-items');
  return { ok: true, stamped: res.stamped, failed: res.failed?.length ?? 0 };
}
