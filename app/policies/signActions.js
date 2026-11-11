'use server';
// Policies signed inside boxes on the policy PDF. The admin places the boxes for each version (saveVersionBoxes);
// staff draw their signature in the boxes (signPolicy). The signed copy is made at once and kept in the staff file.
import { revalidatePath } from 'next/cache';
import { randomUUID, createHash } from 'node:crypto';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildPolicySignedPdf, EMPLOYER } from '@/lib/policySignPdf';
import { groupOf, groupName, levelOf, levelName } from '@/lib/levels';

const TYPES = ['signature', 'initials', 'date', 'name', 'text', 'checkbox'];
const norm = (v) => (v ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'policy';
const positionOf = (profile) => groupName(groupOf(profile)) ?? levelName(levelOf(profile));

// The admin saves the boxes for one version of a policy (box positions in PDF points, like sign requests).
export async function saveVersionBoxes({ version_id, fields }) {
  const { supabase } = await requireUser(['admin']);
  if (!version_id) return { error: 'Choose the policy version first.' };
  if (!Array.isArray(fields)) return { error: 'Something went wrong with the boxes. Please try again.' };
  const clean = fields.slice(0, 200).map((f, i) => ({
    id: String(f?.id ?? `b${i}`).slice(0, 40), type: TYPES.includes(f?.type) ? f.type : 'text', who: 'staff',
    page: Math.max(0, Math.min(999, Math.floor(Number(f?.page) || 0))),
    rect: Array.isArray(f?.rect) ? f.rect.slice(0, 4).map((n) => Math.round(Number(n) * 100) / 100) : [0, 0, 0, 0],
    label: String(f?.label ?? '').slice(0, 80) || null, required: f?.required !== false,
  }));
  if (!clean.some((f) => f.type === 'signature')) return { error: 'Place at least one ✍️ Signature box where the staff member signs.' };
  const { data, error } = await supabase.from('policy_versions').update({ fields: clean }).eq('id', version_id).select('policy_id').single();
  if (error) return { error: error.message };
  revalidatePath(`/policies/${data.policy_id}`);
  return { ok: true };
}

// A staff member signs the current version: boxes filled in, name typed, and the signed copy made and saved.
export async function signPolicy({ policy_id, version_id, name, image, values, agree, agent }) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (agree !== true) return { error: 'Please tick the box to confirm you have read it.' };
  if (!norm(name) || norm(name) !== norm(profile.full_name)) return { error: `To sign, type your full name exactly as it is on your account: "${profile.full_name}".` };
  if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length < 200) return { error: 'Please draw your signature in the box.' };
  if (image.length > 400000) return { error: 'The signature picture is too big. Please clear it and draw again.' };

  const { data: pol } = await supabase.from('policies').select('id, title, code, current_version_id, require_signature').eq('id', policy_id).maybeSingle();
  if (!pol || pol.current_version_id !== version_id) return { error: 'This version is no longer the current one. Please reload the page.' };
  const { data: ver } = await supabase.from('policy_versions').select('id, version_label, effective_date, file_path, fields').eq('id', version_id).maybeSingle();
  const fields = Array.isArray(ver?.fields) ? ver.fields : [];
  if (!fields.some((f) => f.type === 'signature')) return { error: 'This policy isn’t set up for signing yet. Ask the administrator to place the signature boxes.' };

  const vals = values && typeof values === 'object' ? values : {};
  const cleaned = {};
  for (const f of fields) {
    const v = vals[f.id];
    if (f.type === 'text') { const t = String(v ?? '').trim().slice(0, 500); if (f.required && !t) return { error: `Please fill in every required box${f.label ? ` (“${f.label}”)` : ''}.` }; cleaned[f.id] = t; }
    else if (f.type === 'initials') { const t = String(v ?? '').trim().slice(0, 8); if (!t) return { error: 'Please add your initials in every initials box.' }; cleaned[f.id] = t; }
    else if (f.type === 'checkbox') { if (f.required && v !== true) return { error: `Please tick every required checkbox${f.label ? ` (“${f.label}”)` : ''}.` }; cleaned[f.id] = v === true; }
  }

  const admin = createAdminClient();
  const { data: already } = await supabase.from('policy_acks').select('id').eq('policy_version_id', version_id).eq('profile_id', user.id).maybeSingle();
  if (already) return { error: 'You already signed this version.' };

  const { data: file, error: dlErr } = await admin.storage.from('policies').download(ver.file_path);
  if (dlErr || !file) return { error: 'Could not open the policy document.' };
  const fileBytes = Buffer.from(await file.arrayBuffer());
  const ackId = randomUUID();
  const signedAt = new Date();
  let finished;
  try {
    finished = await buildPolicySignedPdf({
      fileBytes, fields, policy: pol, version: { ...ver, file_sha256: createHash('sha256').update(fileBytes).digest('hex') },
      ack: { id: ackId, signed_at: signedAt, signed_name: name.trim() }, staffName: profile.full_name, position: positionOf(profile),
      signatureImage: image, values: cleaned,
    });
  } catch (e) {
    return { error: `The signed copy could not be made, so nothing was saved: ${e?.message ?? e}` };
  }
  const bytes = Buffer.from(finished);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const day = signedAt.toISOString().slice(0, 10);
  const path = `${user.id}/paperwork/${day}-policy-${slug(pol.code || pol.title)}-${randomUUID().slice(0, 8)}.pdf`;
  const up = await admin.storage.from('staff-files').upload(path, bytes, { contentType: 'application/pdf' });
  if (up.error) return { error: 'The signed copy could not be saved, so nothing was signed: ' + up.error.message };

  const { error } = await supabase.from('policy_acks').insert({
    id: ackId, policy_id, policy_version_id: version_id, profile_id: user.id, signed_name: name.trim(),
    signature_image: image, field_values: cleaned, finished_path: path, finished_hash: hash,
  });
  if (error) { await admin.storage.from('staff-files').remove([path]); return { error: error.code === '23505' ? 'You already signed this version.' : 'Could not sign: ' + error.message }; }
  await admin.from('paperwork_pdfs').insert({ profile_id: user.id, kind: 'signed', title: `Policy signed: ${pol.title}${ver.version_label ? ` v${ver.version_label}` : ''}`.slice(0, 300), source_id: `policy:${ackId}`, file_path: path, sha256: hash });
  revalidatePath('/policies'); revalidatePath(`/policies/${policy_id}`); revalidatePath('/onboarding');
  return { ok: true, employer: EMPLOYER };
}
