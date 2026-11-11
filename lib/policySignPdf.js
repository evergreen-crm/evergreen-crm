// The signed copy of a policy: the policy PDF with each person's signature, initials, date and name inside
// the boxes an admin placed, then a signing record page at the end (employer, staff name, policy code,
// date signed, position). Server only.
import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { drawImageBox, drawTextBox, drawTick, wrap, safe, when, day, INK, GREY } from '@/lib/signPdf';

export const EMPLOYER = 'Evergreen Community Care Inc.';
const pngBytes = (dataUrl) => Buffer.from(String(dataUrl).split(',')[1] ?? '', 'base64');

// fields: the boxes (same shape as sign requests). values: { [fieldId]: text | boolean }.
export async function buildPolicySignedPdf({ fileBytes, fields = [], policy, version, ack, staffName, position, signatureImage, values = {} }) {
  const pdf = await PDFDocument.load(new Uint8Array(fileBytes), { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  const sig = signatureImage ? await pdf.embedPng(pngBytes(signatureImage)) : null;

  for (const f of fields) {
    const page = pages[f.page];
    if (!page) throw new Error(`A signature box is on page ${f.page + 1}, which the policy does not have.`);
    const v = values[f.id];
    if (f.type === 'signature') { if (!sig) throw new Error('The signature picture is missing.'); drawImageBox(page, sig, f.rect); }
    else if (f.type === 'initials') drawTextBox(page, italic, f.rect, v);
    else if (f.type === 'date') drawTextBox(page, font, f.rect, day(ack.signed_at));
    else if (f.type === 'name') drawTextBox(page, font, f.rect, staffName);
    else if (f.type === 'text') drawTextBox(page, font, f.rect, v);
    else if (f.type === 'checkbox' && v === true) drawTick(page, f.rect);
  }

  // Signing record page.
  const W = 612, H = 792, M = 56;
  const page = pdf.addPage([W, H]);
  let y = H - M;
  const line = (text, { f = font, size = 11, color = INK, gap = 1.4 } = {}) => {
    for (const ln of wrap(f, safe(text), size, W - M * 2)) {
      page.drawText(ln, { x: M, y, size, font: f, color }); y -= size * gap;
    }
  };
  const row = (label, value) => { page.drawText(safe(label), { x: M, y, size: 10, font: bold, color: GREY }); y -= 13; line(value || '—', { size: 11 }); y -= 6; };

  line('Policy signing record', { f: bold, size: 20, gap: 1.6 }); y -= 6;
  line(EMPLOYER, { color: GREY, size: 12 }); y -= 14;
  row('Staff member', staffName);
  row('Position', position);
  row('Policy code', policy.code ?? '—');
  row('Policy', `${policy.title}`);
  row('Version', `${version.version_label}${version.effective_date ? `, effective ${version.effective_date}` : ''}`);
  row('Date signed', when(ack.signed_at));
  row('Typed name', ack.signed_name);
  row('Record ID', ack.id);
  if (version.file_sha256) row('Policy file fingerprint (SHA-256)', version.file_sha256);
  y -= 6;
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: GREY }); y -= 10;
  if (sig) {
    const h = 44, w = Math.min(220, sig.width * (h / sig.height));
    page.drawImage(sig, { x: M, y: y - h, width: w, height: h }); y -= h + 8;
  }
  line('The staff member read the whole policy, typed their name, and drew their signature in the boxes on the policy pages. They agreed that this is the same as signing on paper.', { size: 9, color: GREY });

  return await pdf.save();
}
