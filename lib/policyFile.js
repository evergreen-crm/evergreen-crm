// A person's full policy file: the one-page witness record plus every signed policy, as one PDF or one ZIP.
// Also the log of who opened a signed copy. Server only; callers check who is asking first.
import 'server-only';
import { deflateRawSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';

const slug = (s) => String(s ?? '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file';

// Every open or download of a signed policy is written to the security audit log.
export async function logPolicyAccess(admin, { by, what, staffId, staffName, policy = null, recordId = null }) {
  try {
    await admin.from('audit_log').insert({ table_name: 'signed_policy_opened', record_id: recordId ?? staffId, action: 'INSERT', changed_by: by.id,
      new_data: { title: `${what}: ${staffName}${policy ? `, ${policy}` : ''}`, opened_by: by.full_name, staff: staffName, policy, what } });
    if (recordId) await admin.from('policy_record_events').insert({ record_id: recordId, event: 'opened', by_profile: by.id, detail: `${by.full_name}: ${what}${policy ? ` (${policy})` : ''}` });
  } catch { /* the log must never block the download */ }
}

// The files for one sign-off record: [{ name, bytes }], the witness record first.
export async function loadPolicyFileParts(admin, rec) {
  const items = Array.isArray(rec.items) ? rec.items : [];
  const { data: acks } = await admin.from('policy_acks').select('id, finished_path').in('id', items.map((i) => i.ack_id));
  const pathOf = Object.fromEntries((acks ?? []).map((a) => [a.id, a.finished_path]));
  const get = async (path) => { const { data } = await admin.storage.from('staff-files').download(path); return data ? Buffer.from(await data.arrayBuffer()) : null; };
  const parts = []; const missing = [];
  if (rec.file_path) { const b = await get(rec.file_path); if (b) parts.push({ name: '00-policy-sign-off-record.pdf', bytes: b }); }
  let n = 0;
  for (const it of items) {
    n++;
    const b = pathOf[it.ack_id] ? await get(pathOf[it.ack_id]) : null;
    if (!b) { missing.push(it.title); continue; }
    parts.push({ name: `${String(n).padStart(2, '0')}-${slug(`${it.code ?? ''} ${it.title}`)}${it.version_label ? `-v${slug(it.version_label)}` : ''}.pdf`, bytes: b });
  }
  return { parts, missing };
}

export async function mergePdf(parts) {
  const out = await PDFDocument.create();
  for (const p of parts) {
    try { const src = await PDFDocument.load(p.bytes, { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach((pg) => out.addPage(pg)); } catch { /* skip a file that can't be read */ }
  }
  return Buffer.from(await out.save());
}

// A plain ZIP file (no extra library).
let TABLE;
function crc32(buf) {
  TABLE ??= Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zip(parts) {
  const d = new Date();
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  const local = [], central = []; let offset = 0;
  for (const p of parts) {
    const name = Buffer.from(p.name, 'utf8'), data = deflateRawSync(p.bytes), crc = crc32(p.bytes);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8); h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(p.bytes.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, name, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10); c.writeUInt16LE(time, 12); c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(p.bytes.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(parts.length, 8); end.writeUInt16LE(parts.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
