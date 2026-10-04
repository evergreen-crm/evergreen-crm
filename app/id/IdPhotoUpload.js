'use client';
// Take a selfie or choose a photo, then crop / zoom / rotate it to the ID card frame (3:4) before sending.
// The finished photo is about 600 × 800 px (~80 KB).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { submitIdPhoto } from '@/app/id/actions';

const OUT_W = 600, OUT_H = 800;      // saved size (3:4)
const VIEW_W = 270, VIEW_H = 360;    // editor frame on screen

export default function IdPhotoUpload({ profileId, label = 'Take or choose photo', note }) {
  const [img, setImg] = useState(null);        // HTMLImageElement being edited
  const [rot, setRot] = useState(0);           // 0, 90, 180, 270
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const canvasRef = useRef(null);
  const drag = useRef(null);
  const router = useRouter();

  // Size of the (rotated) image and the scale that just covers the frame at zoom 1.
  const dims = () => {
    const sideways = rot % 180 !== 0;
    const w = sideways ? img.naturalHeight : img.naturalWidth;
    const h = sideways ? img.naturalWidth : img.naturalHeight;
    return { w, h, cover: Math.max(VIEW_W / w, VIEW_H / h) };
  };

  // Keep the photo covering the whole frame (no empty edges).
  const clamp = (o, z = zoom) => {
    if (!img) return o;
    const { w, h, cover } = dims();
    const s = cover * z;
    const mx = Math.max(0, (w * s - VIEW_W) / 2), my = Math.max(0, (h * s - VIEW_H) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };

  function draw(ctx, outW, outH) {
    const { cover } = dims();
    const k = outW / VIEW_W;                     // screen frame → output scale
    const s = cover * zoom * k;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.save();
    ctx.translate(outW / 2 + off.x * k, outH / 2 + off.y * k);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(s, s);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
  }

  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const c = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = VIEW_W * dpr; c.height = VIEW_H * dpr;
    draw(c.getContext('2d'), c.width, c.height);
  });

  function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setMsg(null);
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { setImg(im); setRot(0); setZoom(1); setOff({ x: 0, y: 0 }); };
    im.onerror = () => setMsg('This photo type can’t be opened here. Please take a new photo or choose a JPG/PNG.');
    im.src = url;
  }

  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, o: off }; };
  const move = (e) => {
    if (!drag.current) return;
    setOff(clamp({ x: drag.current.o.x + e.clientX - drag.current.x, y: drag.current.o.y + e.clientY - drag.current.y }));
  };
  const up = () => { drag.current = null; };
  const setZ = (z) => { setZoom(z); setOff((o) => clamp(o, z)); };
  const rotate = (d) => { setRot((r) => (r + d + 360) % 360); setOff({ x: 0, y: 0 }); };

  async function send() {
    setBusy(true); setMsg(null);
    const c = document.createElement('canvas');
    c.width = OUT_W; c.height = OUT_H;
    draw(c.getContext('2d'), OUT_W, OUT_H);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
    const path = `${profileId}/${crypto.randomUUID()}.jpg`;
    const { error } = await createClient().storage.from('id-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) { setBusy(false); setMsg('Upload failed: ' + error.message); return; }
    const res = await submitIdPhoto(path);
    setBusy(false);
    if (res?.error) { setMsg('Could not save: ' + res.error); return; }
    setImg(null);
    setMsg('Sent to your manager for approval.');
    router.refresh();
  }

  return (
    <div className="photo-pick">
      {!img && (
        <div className="row">
          <label className="button">📷 {label}
            <input type="file" accept="image/*" capture="user" onChange={onFile} hidden />
          </label>
          <label className="button secondary">🖼 Choose from gallery
            <input type="file" accept="image/*" onChange={onFile} hidden />
          </label>
        </div>
      )}
      {!img && note && <p className="muted small">{note}</p>}

      {img && (
        <div className="photo-editor">
          <p className="small"><strong>Fit your face in the frame.</strong> Drag to move, use the slider to zoom, and rotate if it’s sideways.</p>
          <div className="pe-frame" style={{ width: VIEW_W, height: VIEW_H }}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <canvas ref={canvasRef} style={{ width: VIEW_W, height: VIEW_H }} />
            <div className="pe-guide" aria-hidden="true" />
          </div>
          <label className="pe-zoom">Zoom
            <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(e) => setZ(Number(e.target.value))} />
          </label>
          <div className="row">
            <button type="button" className="secondary" onClick={() => rotate(-90)}>⟲ Rotate left</button>
            <button type="button" className="secondary" onClick={() => rotate(90)}>⟳ Rotate right</button>
          </div>
          <div className="row">
            <button type="button" onClick={send} disabled={busy}>{busy ? 'Sending…' : '✓ Use this photo'}</button>
            <button type="button" className="secondary" onClick={() => setImg(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}
