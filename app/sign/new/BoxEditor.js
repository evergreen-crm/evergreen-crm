'use client';
// Place boxes on the PDF: pick the person and the kind of box, then click on the page where it goes.
// Drag a box to move it, drag its bottom-right corner to resize, click it to change or remove it.
import { useRef, useState } from 'react';
import PdfPages, { BOX_TYPES, BOX } from '@/app/sign/PdfPages';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
let seq = 0;
const newId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function BoxEditor({ data, people, boxes, setBoxes, onViewports }) {
  const [who, setWho] = useState(people[0]?.key ?? '');
  const [tool, setTool] = useState('signature');
  const [sel, setSel] = useState(null);
  const drag = useRef(null);
  const whoNow = people.some((p) => p.key === who) ? who : people[0]?.key;
  const person = (k) => people.find((p) => p.key === k);
  const selected = boxes.find((b) => b.id === sel);

  const update = (id, patch) => setBoxes((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const remove = (id) => { setBoxes((list) => list.filter((b) => b.id !== id)); setSel(null); };

  function addAt(page, x, y, vp) {
    if (!whoNow) return;
    const t = BOX[tool];
    const fw = t.w / vp.width, fh = t.h / vp.height;
    const b = { id: newId(), type: tool, who: whoNow, page, fx: clamp(x - fw / 2, 0, 1 - fw), fy: clamp(y - fh / 2, 0, 1 - fh), fw, fh,
      label: '', required: tool !== 'checkbox' };
    setBoxes((list) => [...list, b]); setSel(b.id);
  }

  function startDrag(e, b, mode) {
    e.stopPropagation(); e.preventDefault();
    const pageEl = e.currentTarget.closest('.pdf-page');
    const r = pageEl.getBoundingClientRect();
    drag.current = { id: b.id, mode, x: e.clientX, y: e.clientY, start: { ...b }, w: r.width, h: r.height };
    e.currentTarget.setPointerCapture(e.pointerId);
    setSel(b.id);
  }
  function moveDrag(e) {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.x) / d.w, dy = (e.clientY - d.y) / d.h; const s = d.start;
    if (d.mode === 'move') update(d.id, { fx: clamp(s.fx + dx, 0, 1 - s.fw), fy: clamp(s.fy + dy, 0, 1 - s.fh) });
    else update(d.id, { fw: clamp(s.fw + dx, 0.012, 1 - s.fx), fh: clamp(s.fh + dy, 0.008, 1 - s.fy) });
  }
  const endDrag = () => { drag.current = null; };

  const overlay = (page, { vp, scale }) => boxes.filter((b) => b.page === page).map((b) => {
    const p = person(b.who); const color = p?.color ?? '#555'; const t = BOX[b.type];
    const hPx = b.fh * vp.height * scale;
    return (
      <div key={b.id} className={`sbox${sel === b.id ? ' on' : ''}`} title={`${t.label} — ${p?.label ?? '?'}`}
        style={{ left: `${b.fx * 100}%`, top: `${b.fy * 100}%`, width: `${b.fw * 100}%`, height: `${b.fh * 100}%`, borderColor: color, background: `${color}22`, color }}
        onPointerDown={(e) => startDrag(e, b, 'move')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        {b.type !== 'checkbox' && <span className="sbox-label" style={{ fontSize: Math.max(8, Math.min(12, hPx * 0.5)) }}>{t.icon} {b.label || t.label} · {p?.short ?? '?'}{b.required && b.type === 'text' ? ' *' : ''}</span>}
        <span className="sbox-size" onPointerDown={(e) => startDrag(e, b, 'size')} onPointerMove={moveDrag} onPointerUp={endDrag} />
      </div>
    );
  });

  const counts = people.map((p) => ({ ...p, n: boxes.filter((b) => b.who === p.key).length }));

  return (
    <div className="box-editor">
      <div className="box-tools card">
        <label style={{ margin: 0 }}>Boxes for
          <select value={whoNow ?? ''} onChange={(e) => setWho(e.target.value)} style={{ borderLeft: `6px solid ${person(whoNow)?.color ?? '#999'}` }}>
            {people.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <div className="box-kinds">
          {BOX_TYPES.map((t) => (
            <button key={t.type} type="button" className={tool === t.type ? '' : 'secondary'} onClick={() => setTool(t.type)}>{t.icon} {t.label}</button>
          ))}
        </div>
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          Click on the page where the <strong>{BOX[tool].label.toLowerCase()}</strong> box goes. Drag a box to move it; drag its corner to resize.
          “Date signed” and “Full name” fill in by themselves.
        </p>
        <p className="small" style={{ margin: '4px 0 0' }}>
          {counts.map((p) => <span key={p.key} className="badge" style={{ borderColor: p.color, color: p.color, marginRight: 4 }}>{p.short}: {p.n}</span>)}
        </p>
        {!selected && <div className="box-selected muted small">Click a box to change who fills it, rename it, or remove it.</div>}
        {selected && (
          <div className="box-selected">
            <strong className="small">{BOX[selected.type].icon} {BOX[selected.type].label} box, page {selected.page + 1}</strong>
            <label className="small">Who fills it
              <select value={selected.who} onChange={(e) => update(selected.id, { who: e.target.value })}>
                {people.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            {(selected.type === 'text' || selected.type === 'checkbox') && (
              <label className="small">What it’s for (they’ll see this)
                <input value={selected.label} maxLength={80} placeholder={selected.type === 'text' ? 'e.g. Phone number' : 'e.g. I agree'} onChange={(e) => update(selected.id, { label: e.target.value })} />
              </label>
            )}
            {(selected.type === 'text' || selected.type === 'checkbox') && (
              <label className="check small"><input type="checkbox" checked={selected.required} onChange={(e) => update(selected.id, { required: e.target.checked })} /> Must be filled in</label>
            )}
            <div className="row">
              <button type="button" className="secondary" onClick={() => remove(selected.id)}>🗑 Remove box</button>
              <button type="button" className="link" onClick={() => setSel(null)}>Done</button>
            </div>
          </div>
        )}
      </div>
      <PdfPages source={{ data }} overlay={overlay} onLoad={onViewports} onPageClick={(page, x, y, vp) => { setSel(null); addAt(page, x, y, vp); }} />
    </div>
  );
}
