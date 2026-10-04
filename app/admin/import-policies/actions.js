'use server';
// One-time import of Evergreen's policy manuals (PDFs bundled in /policy-import) into the Policy library.
import fs from 'fs/promises';
import path from 'path';
import { requireUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const DIR = path.join(process.cwd(), 'policy-import');

export async function loadManifest() {
  await requireUser(['admin']);
  return JSON.parse(await fs.readFile(path.join(DIR, 'manifest.json'), 'utf8'));
}

export async function importOne(index) {
  const { supabase, user } = await requireUser(['admin']);
  const list = JSON.parse(await fs.readFile(path.join(DIR, 'manifest.json'), 'utf8'));
  const m = list[index];
  if (!m) return { error: 'Not found' };

  // Find the policy by document code (or title when there is no code)
  let q = supabase.from('policies').select('id, current_version_id, current:current_version_id(version_label)');
  q = m.code ? q.eq('code', m.code) : q.eq('title', m.title);
  const { data: existing } = await q.maybeSingle();
  let policyId = existing?.id;
  if (policyId) {
    const { data: v } = await supabase.from('policy_versions').select('id').eq('policy_id', policyId).eq('version_label', m.version).maybeSingle();
    if (v) return { skipped: true, message: `${m.title} v${m.version} is already in the library` };
  }

  const bytes = await fs.readFile(path.join(DIR, m.file));
  const storagePath = `import/${m.file}`;
  const { error: upErr } = await supabase.storage.from('policies').upload(storagePath, bytes, { contentType: 'application/pdf' });
  if (upErr && !/exists|duplicate/i.test(upErr.message)) return { error: `Upload failed: ${upErr.message}` };

  if (!policyId) {
    const { data: pol, error } = await supabase.from('policies').insert({
      title: m.title, code: m.code || null, category: m.category, description: m.description,
      applies_to: m.applies_to, require_signature: m.require_signature, created_by: user.id,
    }).select('id').single();
    if (error) return { error: error.message };
    policyId = pol.id;
  }
  const { data: ver, error: vErr } = await supabase.from('policy_versions').insert({
    policy_id: policyId, version_label: m.version, file_path: storagePath, file_name: m.file, file_type: 'application/pdf',
    change_note: m.description, effective_date: m.effective, published_by: user.id,
  }).select('id').single();
  if (vErr) return { error: vErr.message };

  // The higher version number becomes current (so v3.0 then v4.0 leaves v4.0 current, v3.0 in history).
  const cur = existing?.current?.version_label;
  const newer = !cur || Number(m.version) >= Number(cur);
  if (newer) await supabase.from('policies').update({ current_version_id: ver.id }).eq('id', policyId);
  revalidatePath('/policies');
  return { ok: true, message: `${m.title} v${m.version}${newer ? '' : ' (kept in history)'}` };
}
