// One set of upload rules for the whole CRM.
// - Every file is stored unpacked: a .zip is opened in the browser and the files inside are
//   uploaded instead. Other archive types (.rar, .7z, .tar, .gz) are refused — unzip them first.
// - Photos are made smaller first (lib/compressImage.js).
// - After that, each file must be 10 MB or less. Supabase enforces the same limit
//   (supabase/upload-limits.sql), so nothing bigger can get in another way.
import { unzip, isZip, mimeFor } from '@/lib/unzip';
import { compressImage, fmtSize } from '@/lib/compressImage';

export const MAX_FILE = 10 * 1024 * 1024;       // per file, after photos are made smaller
export const MAX_ZIP = 100 * 1024 * 1024;       // a zip can be this big before it is unpacked
export const MAX_RAW_PHOTO = 60 * 1024 * 1024;  // a huge phone photo is let in, then made smaller
export const MAX_LABEL = '10 MB';

const OTHER_ARCHIVE = /\.(rar|7z|tar|gz|tgz|bz2|xz|zipx|cab|iso)$/i;
export const isOtherArchive = (file) => OTHER_ARCHIVE.test(file.name);

export const TOO_BIG = `over ${MAX_LABEL}. For a scanned PDF, scan again at normal (not high) quality, or split it into parts.`;
export const OTHER_ARCHIVE_MSG = 'Only .zip files can be unpacked here. Please unzip it on your computer and upload the files inside.';

// Always send a real content type — Supabase checks it against the allowed list.
export const contentTypeFor = (file) => file.type || mimeFor(file.name);

// For upload spots that take ONE file (a checklist item, a certificate, a policy).
// A zip holding exactly one file is unpacked and that file is used.
// Returns { file, note } or { error }.
export async function prepareOne(picked, { keepOriginal = false } = {}) {
  if (isOtherArchive(picked)) return { error: OTHER_ARCHIVE_MSG };
  let file = picked;
  let note = '';
  if (isZip(picked)) {
    if (picked.size > MAX_ZIP) return { error: `That zip is over ${fmtSize(MAX_ZIP)}.` };
    let r;
    try { r = await unzip(picked, { maxFileBytes: MAX_RAW_PHOTO }); } catch (err) { return { error: err.message }; }
    if (r.files.length === 0) {
      const why = r.skipped[0] ? ` (${r.skipped[0].name} — ${r.skipped[0].reason})` : '';
      return { error: `Nothing usable was found inside the zip${why}.` };
    }
    if (r.files.length > 1) {
      return { error: `That zip has ${r.files.length} files, but this spot takes one. Unzip it and upload the right file here.` };
    }
    file = r.files[0];
    note = ` Unpacked from ${picked.name}.`;
  }
  if (!keepOriginal) {
    const small = await compressImage(file);
    if (small.saved) { file = small.file; note += ` Photo made smaller: ${fmtSize(small.before)} → ${fmtSize(small.after)}.`; }
  }
  if (file.size > MAX_FILE) return { error: `${file.name} is ${fmtSize(file.size)} — ${TOO_BIG}` };
  return { file, note };
}
