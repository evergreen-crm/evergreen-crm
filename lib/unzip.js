// Unpack a .zip file in the browser — no extra packages.
// Uses the browser's built-in DecompressionStream (Chrome, Edge, Safari 16.4+, Firefox 113+).
// Returns { files: File[], skipped: [{ name, reason }] }.
// Folders inside the zip are flattened; the folder path is kept in File.zipPath.

const MIME = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', csv: 'text/csv', rtf: 'application/rtf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', tif: 'image/tiff', tiff: 'image/tiff',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'video/mp4', mov: 'video/quicktime',
};
export const mimeFor = (name) => MIME[name.split('.').pop().toLowerCase()] || 'application/octet-stream';
export const isZip = (file) => /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(zipFile, { maxFileBytes = 25 * 1024 * 1024, maxFiles = 200 } = {}) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t unpack zip files. Please update your browser or unzip the files first.');
  const buf = new Uint8Array(await zipFile.arrayBuffer());
  const dv = new DataView(buf.buffer);

  // Find the "end of central directory" record (last 64 KB of the file).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(`${zipFile.name} is not a valid zip file.`);
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (p === 0xffffffff) throw new Error(`${zipFile.name} is too large (ZIP64). Please unzip it first.`);

  const files = [], skipped = [];
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const fullName = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    const base = fullName.split('/').pop();
    if (!base || fullName.endsWith('/')) continue;                                  // folder
    if (fullName.startsWith('__MACOSX/') || base.startsWith('._') || /^(\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(base)) continue; // system junk
    if (flags & 1) { skipped.push({ name: fullName, reason: 'password-protected' }); continue; }
    if (usize > maxFileBytes) { skipped.push({ name: fullName, reason: 'over 25 MB' }); continue; }
    if (/\.zip$/i.test(base)) { skipped.push({ name: fullName, reason: 'zip inside a zip — unzip it separately' }); continue; }
    if (files.length >= maxFiles) { skipped.push({ name: fullName, reason: `more than ${maxFiles} files` }); continue; }

    const lNameLen = dv.getUint16(local + 26, true), lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);
    let data;
    try {
      if (method === 0) data = raw.slice();
      else if (method === 8) data = await inflateRaw(raw);
      else { skipped.push({ name: fullName, reason: 'unsupported compression' }); continue; }
    } catch { skipped.push({ name: fullName, reason: 'could not be unpacked' }); continue; }

    const file = new File([data], base, { type: mimeFor(base) });
    file.zipPath = fullName;
    files.push(file);
  }
  return { files, skipped };
}
