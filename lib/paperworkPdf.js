// Paperwork PDFs: when someone signs an onboarding paper or passes an Academy course, a one-page PDF record
// is made and kept in their staff file (staff-files bucket, <person>/paperwork/), listed in paperwork_pdfs.
// Staff open it from My onboarding; HR and leaders from the person's HR page. A later job copies each PDF
// to OneDrive (onedrive_status). Making the PDF never blocks the signing or the quiz: errors are returned, not thrown.
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { TZ } from '@/lib/options';

const INK = rgb(0.11, 0.14, 0.13);
const GREEN = rgb(0.12, 0.37, 0.27);
const GREY = rgb(0.34, 0.38, 0.35);
// The built-in PDF fonts only know Western letters: swap anything else so drawing never fails.
const safe = (s) => String(s ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[•·]/g, '-')
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
const when = (ts) => new Date(ts).toLocaleString('en-CA', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dayISO = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts));
const slug = (s) => safe(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'record';

function wrap(text, font, size, width) {
  const out = [];
  for (const para of safe(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

// person: { id, full_name }. lines: paragraphs of the record. signature: { image (PNG data URL), name, at } or null.
export async function savePaperworkPdf({ person, kind, sourceId, title, lines = [], signature = null, at = new Date().toISOString() }) {
  try {
    if (!adminKey()) return { error: 'No server key' };
    const admin = createAdminClient();
    const { data: existing } = await admin.from('paperwork_pdfs').select('id').eq('kind', kind).eq('source_id', sourceId).maybeSingle();
    if (existing) return { ok: true, id: existing.id };

    const pdf = await PDFDocument.create();
    pdf.setTitle(safe(title)); pdf.setAuthor('Evergreen Community Care'); pdf.setCreator('Evergreen CRM');
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const W = 612 - 2 * 60;
    let y = 732;
    page.drawText('Evergreen Community Care', { x: 60, y, size: 12, font: bold, color: GREEN });
    y -= 34;
    for (const l of wrap(title, bold, 20, W)) { page.drawText(l, { x: 60, y, size: 20, font: bold, color: INK }); y -= 26; }
    y -= 4;
    page.drawText(safe(`${person.full_name} - ${when(at)} (B.C. time)`), { x: 60, y, size: 11, font, color: GREY });
    y -= 30;
    for (const para of lines) {
      for (const l of wrap(para, font, 12, W)) { page.drawText(l, { x: 60, y, size: 12, font, color: INK }); y -= 17; }
      y -= 8;
    }
    if (signature?.image?.startsWith('data:image/png;base64,')) {
      y -= 10;
      const png = await pdf.embedPng(Buffer.from(signature.image.split(',')[1], 'base64'));
      const h = 60, w = Math.min(240, (png.width / png.height) * h);
      page.drawImage(png, { x: 60, y: y - h, width: w, height: h });
      y -= h + 6;
      page.drawLine({ start: { x: 60, y }, end: { x: 330, y }, thickness: 0.7, color: GREY });
      y -= 16;
      page.drawText(safe(`Signed by ${signature.name} on ${when(signature.at)}`), { x: 60, y, size: 11, font, color: INK });
    }
    page.drawText(safe(`Saved by the Evergreen CRM. Record ${kind}:${sourceId}`).slice(0, 110), { x: 60, y: 48, size: 8, font, color: GREY });

    const bytes = await pdf.save();
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const path = `${person.id}/paperwork/${dayISO(at)}-${slug(title)}-${randomUUID().slice(0, 8)}.pdf`;
    const up = await admin.storage.from('staff-files').upload(path, Buffer.from(bytes), { contentType: 'application/pdf' });
    if (up.error) return { error: up.error.message };
    const { data, error } = await admin.from('paperwork_pdfs')
      .insert({ profile_id: person.id, kind, title: String(title).slice(0, 300), source_id: sourceId, file_path: path, sha256 })
      .select('id').single();
    if (error) return { error: error.message };
    return { ok: true, id: data.id };
  } catch (e) {
    return { error: e?.message ?? 'Could not make the PDF' };
  }
}

// Signed links (one hour) for a person's paperwork, for rows the viewer is allowed to see (rows come from their own client).
export async function paperworkLinks(rows) {
  if (!rows?.length || !adminKey()) return {};
  const { data } = await createAdminClient().storage.from('staff-files').createSignedUrls(rows.map((r) => r.file_path), 3600);
  const out = {};
  (data ?? []).forEach((d, i) => { if (d?.signedUrl) out[rows[i].id] = d.signedUrl; });
  return out;
}
