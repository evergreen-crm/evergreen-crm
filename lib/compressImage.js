// Make photos smaller in the browser before they are uploaded.
// A 3–5 MB phone photo becomes about 300–600 KB (longest side 2000 px, JPEG quality 0.82),
// which keeps printed forms and certificates readable.
// Only JPEG / PNG / WebP photos are changed. PDFs, Word files, GIFs and anything the
// browser can't open (e.g. HEIC on Windows) are uploaded exactly as they are.
// If the smaller version isn't at least 10% smaller, the original is kept.

const MAX_SIDE = 2000;
const QUALITY = 0.82;
const MIN_BYTES = 400 * 1024; // photos under 400 KB are left alone

export const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export async function compressImage(file, { maxSide = MAX_SIDE, quality = QUALITY } = {}) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < MIN_BYTES) return { file, saved: 0 };
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); // keeps phone photos the right way up
  } catch {
    return { file, saved: 0 };
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNG areas become white, not black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
    if (!blob || blob.size > file.size * 0.9) return { file, saved: 0 };
    const name = file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg';
    const out = new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
    if (file.zipPath) out.zipPath = file.zipPath.replace(/\.(png|webp|jpe?g)$/i, '.jpg');
    return { file: out, saved: file.size - out.size, before: file.size, after: out.size };
  } finally {
    bmp.close?.();
  }
}
