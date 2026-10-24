// Makes the finished PDF once everyone has answered: every box filled in (signatures, initials, dates,
// names, text, ticks) on the original pages, then a signing certificate page at the end.
// Saved next to the original in the private sign-docs storage, with its own SHA-256 fingerprint.
import 'server-only';
import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { TZ } from '@/lib/options';

const INK = rgb(0.06, 0.19, 0.35);
const GREY = rgb(0.4, 0.43, 0.42);
// The built-in PDF fonts only know Western letters: swap anything else so drawing never fails.
const safe = (s) => String(s ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/•/g, '-')
  .replace(/[^\x20-\x7E -ÿ]/g, '?');
const when = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '-');
const day = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
const pngBytes = (dataUrl) => Buffer.from(String(dataUrl).split(',')[1] ?? '', 'base64');
export const isPdfRequest = (r) => /pdf/i.test(r?.file_type ?? '') || /\.pdf$/i.test(r?.file_name ?? '');

// Position inside a box as the reader sees it (u right, v up from the bottom-left), on pages that may be turned.
function frame(page, rect) {
  const [a, b, c, d] = rect;
  const x1 = Math.min(a, c), x2 = Math.max(a, c), y1 = Math.min(b, d), y2 = Math.max(b, d);
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const map = {
    0: { o: [x1, y1], ux: [1, 0], vy: [0, 1], w: x2 - x1, h: y2 - y1 },
    90: { o: [x2, y1], ux: [0, 1], vy: [-1, 0], w: y2 - y1, h: x2 - x1 },
    180: { o: [x2, y2], ux: [-1, 0], vy: [0, -1], w: x2 - x1, h: y2 - y1 },
    270: { o: [x1, y2], ux: [0, -1], vy: [1, 0], w: y2 - y1, h: x2 - x1 },
  }[r] ?? { o: [x1, y1], ux: [1, 0], vy: [0, 1], w: x2 - x1, h: y2 - y1 };
  const at = (u, v) => ({ x: map.o[0] + u * map.ux[0] + v * map.vy[0], y: map.o[1] + u * map.ux[1] + v * map.vy[1] });
  return { w: map.w, h: map.h, at, rotate: degrees(r) };
}

function fitText(font, text, maxW, maxSize) {
  let size = maxSize;
  while (size > 5 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  return size;
}

function wrap(font, text, size, maxW) {
  const lines = [];
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxW || !line) line = next; else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

function drawInBox(page, rect, fn) {
  const f = frame(page, rect);
  fn(f);
}

function drawTextBox(page, font, rect, text) {
  drawInBox(page, rect, (f) => {
    const t = safe(text).trim(); if (!t) return;
    const pad = 2;
    if (f.h >= 30) {
      // Tall box: wrap onto several lines.
      const size = Math.min(11, Math.max(6, f.h / 3));
      const lines = wrap(font, t, size, f.w - pad * 2);
      lines.slice(0, Math.floor((f.h - pad) / (size * 1.2))).forEach((ln, i) => {
        const p = f.at(pad, f.h - pad - size * (i + 1) * 1.1);
        page.drawText(ln, { x: p.x, y: p.y, size, font, color: INK, rotate: f.rotate });
      });
      return;
    }
    const size = fitText(font, t, f.w - pad * 2, Math.min(12, f.h * 0.75));
    const p = f.at(pad, Math.max(1, (f.h - size) / 2 + size * 0.15));
    page.drawText(t, { x: p.x, y: p.y, size, font, color: INK, rotate: f.rotate });
  });
}

function drawImageBox(page, img, rect) {
  drawInBox(page, rect, (f) => {
    const s = Math.min(f.w / img.width, f.h / img.height);
    const w = img.width * s, h = img.height * s;
    const p = f.at((f.w - w) / 2, (f.h - h) / 2);
    page.drawImage(img, { x: p.x, y: p.y, width: w, height: h, rotate: f.rotate });
  });
}

function drawTick(page, rect) {
  drawInBox(page, rect, (f) => {
    const m = Math.min(f.w, f.h) * 0.2;
    const a = f.at(m, m), b = f.at(f.w - m, f.h - m), c = f.at(m, f.h - m), d = f.at(f.w - m, m);
    const th = Math.max(1, Math.min(f.w, f.h) / 8);
    page.drawLine({ start: a, end: b, thickness: th, color: INK });
    page.drawLine({ start: c, end: d, thickness: th, color: INK });
  });
}

const signerName = (s) => s.profiles?.full_name ?? s.ext_name ?? '-';
const signerAbout = (s) => (s.profile_id
  ? `Evergreen staff${s.profiles?.homes?.name ? ` - ${s.profiles.homes.name}` : ''}`
  : [s.ext_role, s.ext_org, s.ext_email, s.ext_phone].filter(Boolean).join(' - '));

// Builds and saves the finished PDF. `admin` is the server-only Supabase client (secret key).
export async function buildFinishedPdf(admin, requestId) {
  const { data: r } = await admin.from('sign_requests').select('*, sender:created_by(full_name), home:home_id(name)').eq('id', requestId).maybeSingle();
  if (!r || r.status !== 'Complete' || !isPdfRequest(r)) return { skipped: true };
  const { data: signers } = await admin.from('sign_request_signers')
    .select('id, profile_id, slot, status, viewed_at, signed_at, signed_name, signature_image, signer_ip, signer_agent, field_values, decline_reason, declined_at, ext_name, ext_email, ext_role, ext_org, ext_phone, profiles(full_name, homes(name))')
    .eq('request_id', requestId);
  const { data: file, error } = await admin.storage.from('sign-docs').download(r.file_path);
  if (error || !file) return { error: 'Could not open the original file.' };

  const pdf = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const pages = pdf.getPages();
  const bySlot = Object.fromEntries((signers ?? []).map((s) => [s.slot, s]));
  const images = {};
  const sigImage = async (s) => (images[s.id] ??= s.signature_image ? await pdf.embedPng(pngBytes(s.signature_image)).catch(() => null) : null);

  for (const f of r.fields ?? []) {
    const s = bySlot[f.who]; const page = pages[f.page];
    if (!s || s.status !== 'Signed' || !page) continue;
    const v = s.field_values?.[f.id];
    if (f.type === 'signature') { const img = await sigImage(s); if (img) drawImageBox(page, img, f.rect); }
    else if (f.type === 'initials') drawTextBox(page, italic, f.rect, v);
    else if (f.type === 'date') drawTextBox(page, font, f.rect, day(s.signed_at));
    else if (f.type === 'name') drawTextBox(page, font, f.rect, s.signed_name);
    else if (f.type === 'text') drawTextBox(page, font, f.rect, v);
    else if (f.type === 'checkbox' && v === true) drawTick(page, f.rect);
  }

  // Signing certificate.
  const W = 612, Hh = 792, M = 48;
  let page = pdf.addPage([W, Hh]); let y = Hh - M;
  const line = (text, { f = font, size = 10, color = INK, indent = 0 } = {}) => {
    for (const ln of wrap(f, safe(text), size, W - M * 2 - indent)) {
      if (y < M + size) { page = pdf.addPage([W, Hh]); y = Hh - M; }
      page.drawText(ln, { x: M + indent, y, size, font: f, color }); y -= size * 1.35;
    }
  };
  line('Signing certificate', { f: bold, size: 18 }); y -= 4;
  line('Evergreen Community Care Inc.', { color: GREY }); y -= 8;
  line(`Document: ${r.title}`, { f: bold, size: 11 });
  line(`File: ${r.file_name}   Type: ${r.category}`);
  line(`Sent by ${r.sender?.full_name ?? '-'}${r.home?.name ? ` (${r.home.name})` : ''} on ${when(r.created_at)}`);
  line(`Completed ${when(r.completed_at)}   Request ID: ${r.id}`);
  if (r.doc_hash) line(`Original file fingerprint (SHA-256): ${r.doc_hash}`, { size: 8, color: GREY });
  y -= 10;
  for (const s of (signers ?? []).sort((a, b) => String(a.signed_at ?? a.declined_at ?? '').localeCompare(String(b.signed_at ?? b.declined_at ?? '')))) {
    if (y < M + 120) { page = pdf.addPage([W, Hh]); y = Hh - M; }
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: GREY }); y -= 8;
    line(`${signerName(s)} - ${s.status}`, { f: bold, size: 11 });
    line(signerAbout(s), { color: GREY, size: 9 });
    line(`Opened: ${when(s.viewed_at)}`, { size: 9 });
    if (s.status === 'Signed') {
      line(`Signed: ${when(s.signed_at)} - typed name "${s.signed_name}"${s.signer_ip ? ` - IP ${s.signer_ip}` : ''}${s.profile_id ? ' - signed in to the Evergreen CRM' : ' - identity checked with a code sent to their email'}`, { size: 9 });
      const img = await sigImage(s);
      if (img) { const h = 40, w = Math.min(200, img.width * (h / img.height)); y -= h; page.drawImage(img, { x: M, y, width: w, height: h }); y -= 6; }
    } else if (s.status === 'Declined') {
      line(`Declined: ${when(s.declined_at)} - reason: ${s.decline_reason ?? ''}`, { size: 9 });
    }
    y -= 6;
  }
  y -= 8;
  line('Each person confirmed they read the whole document and signed electronically, which they agreed is the same as signing on paper.', { size: 8, color: GREY });

  const bytes = await pdf.save();
  const hash = createHash('sha256').update(bytes).digest('hex');
  const path = `${r.created_by}/${r.id}-signed.pdf`;
  const up = await admin.storage.from('sign-docs').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (up.error) return { error: 'Could not save the finished PDF: ' + up.error.message };
  await admin.from('sign_requests').update({ filled_path: path, filled_hash: hash, filled_at: new Date().toISOString() }).eq('id', r.id);
  return { ok: true, path, bytes, hash, request: r, signers: signers ?? [] };
}
