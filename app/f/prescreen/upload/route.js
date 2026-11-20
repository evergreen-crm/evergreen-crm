// Pre-screen uploads: resume, cover letter and photos / PDFs of certificates (2 MB each; phone photos are shrunk in
// the browser first). Only through the applicant's private link (and their email-code session when the link needs one),
// and only until they sign. Files go to the private "applications" store under prescreen/<file id>/.
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { CHECKLIST } from '@/lib/prescreenChecklist';

export const dynamic = 'force-dynamic';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const DOC_KEYS = new Set(CHECKLIST.flatMap((g) => g.items).filter((i) => i.kind === 'doc' || i.kind === 'consent').map((i) => i.k));
const TYPES = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

async function openFile(token) {
  if (!/^[0-9a-f]{40,80}$/i.test(token ?? '') || !adminKey()) return null;
  const admin = createAdminClient();
  const { data: p } = await admin.from('prescreens').select('id, link_status, expires_at, require_code, session_hash, resume_path, cover_path, cert_files').eq('token', token).maybeSingle();
  if (!p || !['Sent', 'Opened'].includes(p.link_status) || (p.expires_at && new Date(p.expires_at) < new Date())) return null;
  if (p.require_code) {
    const v = (await cookies()).get(`evg_ps_${token.slice(0, 16)}`)?.value;
    if (!v || sha(v) !== p.session_hash) return null;
  }
  return { admin, p };
}

export async function POST(request) {
  let fd;
  try { fd = await request.formData(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const o = await openFile(String(fd.get('token') ?? ''));
  if (!o) return Response.json({ error: 'Your session has ended. Open the link from your email again.' }, { status: 401 });
  const { admin, p } = o;
  const what = String(fd.get('what') ?? '');
  const remove = fd.get('remove') === '1';

  if (remove) {
    if (what === 'resume' || what === 'cover') {
      if (p[`${what}_path`]) await admin.storage.from('applications').remove([p[`${what}_path`]]);
      await admin.from('prescreens').update({ [`${what}_path`]: null, [`${what}_name`]: null }).eq('id', p.id);
    } else {
      const path = String(fd.get('path') ?? '');
      const list = (p.cert_files ?? []).filter((f) => f.path !== path);
      if (list.length !== (p.cert_files ?? []).length) await admin.storage.from('applications').remove([path]);
      await admin.from('prescreens').update({ cert_files: list }).eq('id', p.id);
    }
    return Response.json({ ok: true });
  }

  const file = fd.get('file');
  if (!file || typeof file === 'string' || !file.size) return Response.json({ error: 'Choose a file first.' }, { status: 400 });
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name ?? '')?.[1] ?? '').toLowerCase();
  const type = TYPES[ext] ?? (Object.values(TYPES).includes(file.type) ? file.type : null);
  if (!type) return Response.json({ error: 'Please upload a PDF, Word file or photo (JPG or PNG).' }, { status: 400 });
  if (file.size > 2 * 1024 * 1024) return Response.json({ error: 'The file is bigger than 2 MB. Take the photo again or save a smaller PDF.' }, { status: 400 });
  const kind = what === 'resume' || what === 'cover' ? what : DOC_KEYS.has(what) ? 'doc' : null;
  if (!kind) return Response.json({ error: 'Unknown document.' }, { status: 400 });
  if (kind === 'doc' && (p.cert_files ?? []).length >= 15) return Response.json({ error: 'Up to 15 documents. Remove one first.' }, { status: 400 });
  const safeExt = Object.keys(TYPES).find((k) => TYPES[k] === type && (k === ext || !TYPES[ext])) ?? 'pdf';
  const path = `prescreen/${p.id}/${kind === 'doc' ? what : kind}-${Date.now()}.${safeExt}`;
  const { error } = await admin.storage.from('applications').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: type, upsert: false });
  if (error) return Response.json({ error: 'Could not upload: ' + error.message }, { status: 400 });
  const name = String(file.name ?? `${what}.${safeExt}`).slice(0, 120);
  if (kind === 'doc') {
    await admin.from('prescreens').update({ cert_files: [...(p.cert_files ?? []), { key: what, path, name, at: new Date().toISOString() }] }).eq('id', p.id);
  } else {
    if (p[`${kind}_path`]) await admin.storage.from('applications').remove([p[`${kind}_path`]]);
    await admin.from('prescreens').update({ [`${kind}_path`]: path, [`${kind}_name`]: name }).eq('id', p.id);
  }
  return Response.json({ ok: true, name, path });
}
