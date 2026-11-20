// Online job application (plan B5): resume / cover letter upload (up to 2 MB; server actions stop at 1 MB).
import { openApp } from '@/lib/applyAuth';

export const dynamic = 'force-dynamic';

const TYPES = { 'application/pdf': 'pdf', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };
export async function POST(request) {
  let fd;
  try { fd = await request.formData(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const res = await upload(fd);
  return Response.json(res, { status: res.error ? 400 : 200 });
}

async function upload(fd) {
  const token = String(fd.get('token') ?? '');
  const kind = fd.get('kind') === 'cover' ? 'cover' : 'resume';
  const o = await openApp(token);
  if (!o) return { error: 'Your session has ended. Open the link from your email again.' };
  if (o.app.status !== 'Draft') return { error: 'This application has already been sent.' };
  const file = fd.get('file');
  if (!file || typeof file === 'string' || !file.size) return { error: 'Choose a file first.' };
  const ext = TYPES[file.type] ?? (/\.(pdf|docx?)$/i.exec(file.name ?? '')?.[1]?.toLowerCase());
  if (!ext || !['pdf', 'doc', 'docx'].includes(ext)) return { error: 'Please upload a PDF or Word file (no zip files).' };
  if (file.size > 2 * 1024 * 1024) return { error: 'The file is bigger than 2 MB. Please save a smaller copy (for example, PDF without photos).' };
  const contentType = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[ext];
  const path = `${o.app.id}/${kind}-${Date.now()}.${ext}`;
  const { error } = await o.admin.storage.from('applications').upload(path, Buffer.from(await file.arrayBuffer()), { contentType, upsert: false });
  if (error) return { error: 'Could not upload: ' + error.message };
  const old = o.app[`${kind}_path`];
  await o.admin.from('job_applications').update({ [`${kind}_path`]: path, [`${kind}_name`]: String(file.name ?? `${kind}.${ext}`).slice(0, 120) }).eq('id', o.app.id);
  if (old) await o.admin.storage.from('applications').remove([old]);
  return { ok: true, name: file.name };
}

