'use client';
// Shows each page of a PDF as a picture, with boxes laid on top (placing boxes, or filling them in).
// Uses Mozilla's PDF.js, loaded from the jsDelivr CDN only when a PDF is opened.
import { useEffect, useRef, useState } from 'react';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
let lib = null;
async function pdfjs() {
  if (!lib) {
    // Load at run time (not bundled into the app).
    lib = new Function('u', 'return import(u)')(PDFJS).then((m) => { m.GlobalWorkerOptions.workerSrc = WORKER; return m; });
  }
  return lib;
}

// Kinds of box, their default size on the page (in PDF points) and colours for each person.
export const BOX_TYPES = [
  { type: 'signature', label: 'Signature', icon: '✍️', w: 150, h: 36 },
  { type: 'initials', label: 'Initials', icon: '🔤', w: 50, h: 28 },
  { type: 'date', label: 'Date signed', icon: '📅', w: 90, h: 18 },
  { type: 'name', label: 'Full name', icon: '👤', w: 140, h: 18 },
  { type: 'text', label: 'Text', icon: '📝', w: 160, h: 18 },
  { type: 'checkbox', label: 'Checkbox', icon: '☑️', w: 14, h: 14 },
];
export const BOX = Object.fromEntries(BOX_TYPES.map((b) => [b.type, b]));
export const PERSON_COLORS = ['#1f6feb', '#c2410c', '#7e22ce', '#0f766e', '#b91c1c', '#4d7c0f', '#a16207', '#be185d', '#334155', '#0369a1'];

// Page box (display fractions, top-left origin) <-> PDF rectangle [x1, y1, x2, y2] in points.
export function toPdfRect(vp, b) {
  const [x1, y1] = vp.convertToPdfPoint(b.fx * vp.width, b.fy * vp.height);
  const [x2, y2] = vp.convertToPdfPoint((b.fx + b.fw) * vp.width, (b.fy + b.fh) * vp.height);
  return [x1, y1, x2, y2].map((n) => Math.round(n * 100) / 100);
}
export function fromPdfRect(vp, rect) {
  const [a, b, c, d] = vp.convertToViewportRectangle(rect);
  return { fx: Math.min(a, c) / vp.width, fy: Math.min(b, d) / vp.height, fw: Math.abs(c - a) / vp.width, fh: Math.abs(d - b) / vp.height };
}

// source: { url } or { data: ArrayBuffer }. overlay(pageIndex, { vp, scale }) draws the boxes for that page.
// onLoad(viewports) gives the page sizes (scale 1) once the PDF is open.
export default function PdfPages({ source, overlay, onLoad, onPageClick, maxWidth = 860 }) {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null);
  const docRef = useRef(null);

  useEffect(() => {
    let dead = false;
    setPages(null); setError(null);
    (async () => {
      try {
        const m = await pdfjs();
        const task = m.getDocument(source.url ? { url: source.url } : { data: new Uint8Array(source.data.slice(0)) });
        const doc = await task.promise;
        if (dead) { doc.destroy(); return; }
        docRef.current = doc;
        const list = [];
        for (let i = 1; i <= Math.min(doc.numPages, 200); i++) {
          const page = await doc.getPage(i);
          list.push({ page, vp: page.getViewport({ scale: 1 }) });
        }
        if (dead) return;
        setPages(list);
        onLoad?.(list.map((p) => p.vp));
      } catch (e) {
        if (!dead) setError(/password/i.test(e?.message ?? '') ? 'This PDF has a password. Save a copy without the password and try again.' : 'The PDF couldn’t be shown here. ' + (e?.message ?? ''));
      }
    })();
    return () => { dead = true; docRef.current?.destroy?.(); docRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.url, source.data]);

  if (error) return <p className="message error">{error}</p>;
  if (!pages) return <p className="muted">Opening the document…</p>;
  return (
    <div className="pdf-pages" style={{ maxWidth }}>
      {pages.map((p, i) => <Page key={i} index={i} {...p} overlay={overlay} onPageClick={onPageClick} total={pages.length} />)}
    </div>
  );
}

function Page({ index, page, vp, overlay, onPageClick, total }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!width) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const view = page.getViewport({ scale: (width / vp.width) * ratio });
    const c = canvas.current; c.width = Math.floor(view.width); c.height = Math.floor(view.height);
    const task = page.render({ canvasContext: c.getContext('2d'), viewport: view });
    task.promise.catch(() => {});
    return () => task.cancel?.();
  }, [width, page, vp]);

  const scale = width ? width / vp.width : 1;
  return (
    <div className="pdf-page-wrap">
      <div ref={wrap} className="pdf-page" style={{ aspectRatio: `${vp.width} / ${vp.height}` }}
        onPointerDown={onPageClick ? (e) => {
          if (e.target !== e.currentTarget && e.target !== canvas.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          onPageClick(index, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, vp);
        } : undefined}>
        <canvas ref={canvas} />
        {width > 0 && overlay?.(index, { vp, scale })}
      </div>
      <p className="muted small" style={{ textAlign: 'center', margin: '4px 0 12px' }}>Page {index + 1} of {total}</p>
    </div>
  );
}
