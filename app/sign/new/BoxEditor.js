'use client';
// Place boxes on the PDF. The tools sit in a panel on the left: pick the person and the kind of box,
// then click on the page where it goes. Remove a box with its ✕ mark, by double-clicking it,
// with the Delete key, or from the list on the left.
import { useEffect, useRef, useState } from 'react';
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
  const remove = (id) => { setBoxes((list) => list.filter((b) => b.id !== id)); setSel((s) => (s === id ? null : s)); };

  // Delete / Backspace removes the selected box, unless the person is typing in a field.
  useEffect(() => {
    function onKey(e) {
      if (!sel) return;
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(sel); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
      <div key={b.id} className={`sbox${sel === b.id ? ' on' : ''}`} title={`${t.label} — ${p?.label ?? '?'} (double-click or ✕ to remove)`}
        style={{ left: `${b.fx * 100}%`, top: `${b.fy * 100}%`, width: `${b.fw * 100}%`, height: `${b.fh * 100}%`, borderColor: color, background: `${color}22`, color }}
        onPointerDown={(e) => startDrag(e, b, 'move')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
        onDoubleClick={(e) => { e.stopPropagation(); remove(b.id); }}>
        {b.type !== 'checkbox' && <span className="sbox-label" style={{ fontSize: Math.max(8, Math.min(12, hPx * 0.5)) }}>{t.icon} {b.label || t.label} · {p?.short ?? '?'}{b.required && b.type === 'text' ? ' *' : ''}</span>}
        <button type="button" className="sbox-x" aria-label={`Remove this ${t.label.toLowerCase()} box`} title="Remove this box"
          onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(b.id); }}>✕</button>
        <span className="sbox-size" onPointerDown={(e) => startDrag(e, b, 'size')} onPointerMove={moveDrag} onPointerUp={endDrag} />
      </div>
    );
  });

  const counts = people.map((p) => ({ ...p, n: boxes.filter((b) => b.who === p.key).length }));
  const pageLabel = (b) => `Page ${b.page + 1}`;

  return (
    <div className="box-editor">
      <aside className="box-tools card" aria-label="Box tools">
        <strong className="small">1. Who fills the box</strong>
        <select value={whoNow ?? ''} onChange={(e) => setWho(e.target.value)} style={{ borderLeft: `6px solid ${person(whoNow)?.color ?? '#999'}`, marginTop: 4 }}>
          {people.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>

        <strong className="small" style={{ marginTop: 10 }}>2. Choose a box, then click the page</strong>
        <div className="box-kinds">
          {BOX_TYPES.map((t) => (
            <button key={t.type} type="button" className={tool === t.type ? '' : 'secondary'} onClick={() => setTool(t.type)}>{t.icon} {t.label}</button>
          ))}
        </div>
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          Click on the page where the <strong>{BOX[tool].label.toLowerCase()}</strong> box goes. “Date signed” and “Full name” fill in by themselves.
        </p>

        <p className="small" style={{ margin: '8px 0 0' }}>
          {counts.map((p) => <span key={p.key} className="badge" style={{ borderColor: p.color, color: p.color, marginRight: 4 }}>{p.short}: {p.n}</span>)}
        </p>

        {selected ? (
          <div className="box-selected">
            <strong className="small">{BOX[selected.type].icon} {BOX[selected.type].label} box, {pageLabel(selected)}</strong>
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
              <button type="button" className="secondary" onClick={() => remove(selected.id)}>🗑 Remove this box</button>
              <button type="button" className="link" onClick={() => setSel(null)}>Done</button>
            </div>
          </div>
        ) : (
          <p className="muted small" style={{ margin: '8px 0 0' }}>Click a box on the page to change it. Double-click it, or press ✕, to remove it.</p>
        )}

        <strong className="small" style={{ marginTop: 10 }}>All boxes ({boxes.length})</strong>
        {boxes.length === 0 && <p className="muted small" style={{ margin: '4px 0 0' }}>No boxes yet.</p>}
        <ul className="box-list">
          {boxes.map((b) => {
            const p = person(b.who); const t = BOX[b.type];
            return (
              <li key={b.id} className={sel === b.id ? 'on' : ''}>
                <button type="button" className="link small" onClick={() => setSel(b.id)} style={{ color: p?.color }}>
                  {t.icon} {b.label || t.label} · {p?.short ?? '?'} · {pageLabel(b)}
                </button>
                <button type="button" className="sbox-x-list" aria-label={`Remove ${t.label.toLowerCase()} box`} title="Remove" onClick={() => remove(b.id)}>✕</button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="box-page-col">
        <PdfPages source={{ data }} overlay={overlay} onLoad={onViewports} onPageClick={(page, x, y, vp) => { setSel(null); addAt(page, x, y, vp); }} />
      </div>
    </div>
  );
}
