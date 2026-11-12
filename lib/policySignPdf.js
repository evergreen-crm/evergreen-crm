// The signed copy of a policy: the signature is INSIDE the policy, on its last page. No page is added.
//   * No boxes placed (the usual case): the last page is fitted into the top of the sheet and a signature
//     strip is drawn in the space underneath: staff signature, name, position, date, and the witness.
//   * Boxes placed by the administrator: each box is filled in where it sits, and a one-line signing note
//     goes in the bottom margin of the last page.
// The witness (Program Coordinator, Program Manager or director) is added later by making the copy again
// with `witness` filled in. Also builds the one-page policy sign-off record the witness signs. Server only.
import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { drawImageBox, drawTextBox, drawTick, wrap, safe, when, day, INK, GREY } from '@/lib/signPdf';

export const EMPLOYER = 'Evergreen Community Care Inc.';
const pngBytes = (dataUrl) => Buffer.from(String(dataUrl).split(',')[1] ?? '', 'base64');
const LINE = rgb(0.72, 0.76, 0.74);
const GREEN = rgb(0.04, 0.35, 0.2);
const STRIP_H = 118;   // height of the signature strip, in points
const short = (id) => String(id ?? '').replace(/-/g, '').slice(0, 8).toUpperCase();

async function embedSig(pdf, dataUrl) {
  if (!dataUrl || !String(dataUrl).startsWith('data:image/png')) return null;
  try { return await pdf.embedPng(pngBytes(dataUrl)); } catch { return null; }
}
const fit = (font, text, size, maxW) => { let t = safe(text); while (t.length > 4 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2); return t === safe(text) ? t : `${t.slice(0, -1)}...`; };

// One signature block: the drawn signature above a line, then who and when underneath.
function sigBlock(page, { x, y, w, img, fonts, title, name, role, dateText, pending, typed }) {
  const { font, bold, italic } = fonts;
  page.drawText(safe(title), { x, y: y + 62, size: 7, font: bold, color: GREY });
  if (img) {
    const s = Math.min((w - 8) / img.width, 30 / img.height);
    page.drawImage(img, { x: x + 4, y: y + 29, width: img.width * s, height: img.height * s });
  } else if (typed) {
    // Signed before drawn signatures were kept: the typed name stands as the signature.
    page.drawText(fit(italic, typed, 15, w - 8), { x: x + 4, y: y + 33, size: 15, font: italic, color: INK });
  } else if (pending) {
    page.drawText(safe(pending), { x: x + 4, y: y + 36, size: 8.5, font, color: GREY });
  }
  page.drawLine({ start: { x, y: y + 26 }, end: { x: x + w, y: y + 26 }, thickness: 0.7, color: INK });
  if (name) page.drawText(fit(bold, name, 9, w), { x, y: y + 15, size: 9, font: bold, color: INK });
  if (role || dateText) page.drawText(fit(font, [role, dateText].filter(Boolean).join('  ·  ').replace(/·/g, '-'), 8, w), { x, y: y + 4, size: 8, font, color: INK });
}

const recordLine = ({ policy, version, ack }) => [
  'Signed electronically in the Evergreen CRM', EMPLOYER,
  `${policy.code ?? policy.title}${version.version_label ? ` v${version.version_label}` : ''}`,
  `Record ${short(ack.id)}`,
  version.file_sha256 ? `Policy file ${String(version.file_sha256).slice(0, 12)}` : null,
].filter(Boolean).join('  |  ');

// fields: boxes placed by the admin (may be empty). values: { [fieldId]: text | boolean }.
// witness (optional): { name, role, at, image }.
export async function buildPolicySignedPdf({ fileBytes, fields = [], policy, version, ack, staffName, position, signatureImage, values = {}, witness = null }) {
  const pdf = await PDFDocument.load(new Uint8Array(fileBytes), { ignoreEncryption: true });
  const fonts = { font: await pdf.embedFont(StandardFonts.Helvetica), italic: await pdf.embedFont(StandardFonts.HelveticaOblique), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const { font, italic, bold } = fonts;
  const sig = await embedSig(pdf, signatureImage);
  if (!sig && !ack.signed_name) throw new Error('The signature is missing.');
  const wit = witness ? await embedSig(pdf, witness.image) : null;
  const boxes = fields.filter((f) => f && Array.isArray(f.rect));
  const useBoxes = boxes.some((f) => f.type === 'signature');
  const pages = pdf.getPages();
  if (!pages.length) throw new Error('The policy file has no pages.');

  if (useBoxes) {
    for (const f of boxes) {
      const page = pages[f.page];
      if (!page) throw new Error(`A signature box is on page ${f.page + 1}, which the policy does not have.`);
      const v = values[f.id];
      if (f.type === 'signature') { if (sig) drawImageBox(page, sig, f.rect); else drawTextBox(page, italic, f.rect, ack.signed_name); }
      else if (f.type === 'initials') drawTextBox(page, italic, f.rect, v);
      else if (f.type === 'date') drawTextBox(page, font, f.rect, day(ack.signed_at));
      else if (f.type === 'name') drawTextBox(page, font, f.rect, staffName);
      else if (f.type === 'text') drawTextBox(page, font, f.rect, v);
      else if (f.type === 'checkbox' && v === true) drawTick(page, f.rect);
    }
    // One line in the bottom margin of the last page (unturned pages only, so it always reads the right way).
    const last = pages[pages.length - 1];
    if (last.getRotation().angle % 360 === 0) {
      const w = last.getWidth();
      const note = `${recordLine({ policy, version, ack })}  |  Signed by ${staffName}, ${when(ack.signed_at)}${witness ? `  |  Witnessed by ${witness.name} (${witness.role}), ${day(witness.at)}` : ''}`;
      wrap(font, safe(note), 6, w - 72).slice(0, 2).forEach((ln, i) => last.drawText(ln, { x: 36, y: 16 - i * 7, size: 6, font, color: GREY }));
    }
    return await pdf.save();
  }

  // ---- No boxes: fit the last page into the top of a sheet and put the signature strip underneath. ----
  const old = pages[pages.length - 1];
  const turned = old.getRotation().angle % 360 !== 0;
  const W = old.getWidth(), H = old.getHeight();
  let page = old;
  if (!turned && H > STRIP_H * 3) {
    const embedded = await pdf.embedPage(old);
    const s = (H - STRIP_H - 6) / H;
    page = pdf.addPage([W, H]);
    page.drawPage(embedded, { x: (W - W * s) / 2, y: STRIP_H + 6, xScale: s, yScale: s });
    pdf.removePage(pages.length - 1);   // the original last page; the new sheet is now last
  } else {
    // A turned or very small page: a white strip along the bottom edge instead.
    page.drawRectangle({ x: 0, y: 0, width: W, height: STRIP_H + 6, color: rgb(1, 1, 1) });
  }
  const M = 30, x0 = M, y0 = 10, w = W - M * 2, h = STRIP_H - 12;
  page.drawRectangle({ x: x0, y: y0, width: w, height: h, borderColor: LINE, borderWidth: 0.8, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: x0, y: y0 + h - 15, width: w, height: 15, color: GREEN });
  page.drawText('STAFF ACKNOWLEDGEMENT AND SIGNATURE', { x: x0 + 8, y: y0 + h - 11, size: 8, font: bold, color: rgb(1, 1, 1) });
  const right = safe(`${policy.code ?? ''}${version.version_label ? `  v${version.version_label}` : ''}`);
  page.drawText(right, { x: x0 + w - 8 - bold.widthOfTextAtSize(right, 8), y: y0 + h - 11, size: 8, font: bold, color: rgb(1, 1, 1) });
  const col = (w - 16 - 18) / 2;
  page.drawText(fit(font, 'I have read this whole policy, I understand it, and I agree to follow it.', 8, w - 16), { x: x0 + 8, y: y0 + h - 26, size: 8, font, color: INK });
  sigBlock(page, { x: x0 + 8, y: y0 + 9, w: col, img: sig, typed: sig ? null : ack.signed_name, fonts, title: 'STAFF MEMBER', name: staffName, role: position, dateText: `Signed ${when(ack.signed_at)}` });
  sigBlock(page, { x: x0 + 8 + col + 18, y: y0 + 9, w: col, img: wit, fonts, title: 'WITNESS (REVIEWED THE SIGNED COPY)',
    name: witness ? witness.name : '', role: witness ? witness.role : '', dateText: witness ? `Reviewed ${day(witness.at)}` : '',
    pending: witness ? (wit ? null : 'Signed electronically') : 'Waiting for the witness review' });
  page.drawText(fit(font, recordLine({ policy, version, ack }), 5.5, w), { x: x0, y: 3, size: 5.5, font, color: GREY });
  return await pdf.save();
}

// The one-page policy sign-off record: every policy the person signed, and the witness's signature.
// items: [{ code, title, version_label, signed_at, ack_id }]
export async function buildPolicyRecordPdf({ recordId, staffName, position, house, employeeNo, items = [], witness = null, staffSignature = null }) {
  const pdf = await PDFDocument.create();
  const fonts = { font: await pdf.embedFont(StandardFonts.Helvetica), italic: await pdf.embedFont(StandardFonts.HelveticaOblique), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const { font, bold } = fonts;
  const W = 612, H = 792, M = 44;
  const page = pdf.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 64, width: W, height: 64, color: GREEN });
  page.drawText('POLICY SIGN-OFF RECORD', { x: M, y: H - 34, size: 17, font: bold, color: rgb(1, 1, 1) });
  page.drawText(safe(`${EMPLOYER}  |  Record ${short(recordId)}`), { x: M, y: H - 51, size: 9, font, color: rgb(1, 1, 1) });
  let y = H - 86;
  const pair = (label, value, x) => { page.drawText(safe(label), { x, y, size: 7.5, font: bold, color: GREY }); page.drawText(fit(font, value || '-', 10.5, 250), { x, y: y - 13, size: 10.5, font, color: INK }); };
  pair('STAFF MEMBER', staffName, M); pair('POSITION', position, M + 270); y -= 34;
  pair('HOUSE', house, M); pair('STAFF ID', employeeNo, M + 270); y -= 34;

  // Table: as many rows as fit on one page (font shrinks for long lists).
  const n = Math.max(items.length, 1);
  const rowH = Math.max(9.5, Math.min(16, (y - 190) / (n + 1)));
  const fs = Math.max(6.2, Math.min(9, rowH * 0.62));
  const cols = [{ t: '#', x: M, w: 18 }, { t: 'POLICY CODE', x: M + 18, w: 132 }, { t: 'POLICY', x: M + 150, w: 232 }, { t: 'VERSION', x: M + 382, w: 44 }, { t: 'SIGNED', x: M + 426, w: 98 }];
  page.drawRectangle({ x: M, y: y - rowH + 3, width: W - M * 2, height: rowH, color: rgb(0.93, 0.96, 0.94) });
  cols.forEach((c) => page.drawText(c.t, { x: c.x + 3, y: y - rowH + 3 + (rowH - fs) / 2 + 1, size: Math.min(fs, 7.5), font: bold, color: GREY }));
  y -= rowH;
  items.forEach((it, i) => {
    const cells = [String(i + 1), it.code ?? '-', it.title ?? '-', it.version_label ? `v${it.version_label}` : '-', it.signed_at ? day(it.signed_at) : '-'];
    cols.forEach((c, k) => page.drawText(fit(font, cells[k], fs, c.w - 6), { x: c.x + 3, y: y - rowH + 3 + (rowH - fs) / 2 + 1, size: fs, font, color: INK }));
    page.drawLine({ start: { x: M, y: y - rowH + 3 }, end: { x: W - M, y: y - rowH + 3 }, thickness: 0.3, color: LINE });
    y -= rowH;
  });

  // Witness statement and signatures, fixed at the bottom of the page.
  const by = 44;
  page.drawRectangle({ x: M, y: by, width: W - M * 2, height: 130, borderColor: LINE, borderWidth: 0.8 });
  const stmt = `Witness review: I opened and checked the signed copy of each of the ${items.length} polic${items.length === 1 ? 'y' : 'ies'} listed above. Each one carries this staff member's signature, name and date on the policy itself.`;
  wrap(font, safe(stmt), 8.5, W - M * 2 - 20).slice(0, 3).forEach((ln, i) => page.drawText(ln, { x: M + 10, y: by + 114 - i * 11, size: 8.5, font, color: INK }));
  const col = (W - M * 2 - 20 - 18) / 2;
  const stf = await embedSig(pdf, staffSignature);
  const wit = witness ? await embedSig(pdf, witness.image) : null;
  sigBlock(page, { x: M + 10, y: by + 8, w: col, img: stf, typed: stf ? null : staffName, fonts, title: 'STAFF MEMBER', name: staffName, role: position, dateText: items.length ? `All signed by ${day(items.map((i) => i.signed_at).filter(Boolean).map((t) => new Date(t).toISOString()).sort().pop() ?? new Date())}` : '' });
  sigBlock(page, { x: M + 10 + col + 18, y: by + 8, w: col, img: wit, fonts, title: 'WITNESS', name: witness?.name ?? '', role: witness?.role ?? '', dateText: witness ? `Reviewed ${when(witness.at)}` : '', pending: witness ? null : 'Waiting for the witness review' });
  page.drawText(safe('Signed electronically in the Evergreen CRM. Each signed policy is kept in the staff file with its own record number.'), { x: M, y: 28, size: 6.5, font, color: GREY });
  return await pdf.save();
}
