'use client';
// Offline notes (plan B3). When the internet is down and staff press Save on a daily note or a record,
// the note is kept on this device instead of being lost. It uploads by itself when the internet is back
// (checked when the connection returns, when a page opens, and every minute), with the time it was written.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'evg-offline-queue';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
const save = (q) => { try { localStorage.setItem(KEY, JSON.stringify(q)); return true; } catch { return false; } };
const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
}));

export default function OfflineQueue({ userId }) {
  const [queue, setQueue] = useState([]);
  const [online, setOnline] = useState(true);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const mine = queue.filter((i) => i.userId === userId);
  const waiting = mine.filter((i) => !i.error);
  const failed = mine.filter((i) => i.error);

  const sync = useCallback(async () => {
    const q = load(); const items = q.filter((i) => i.userId === userId && !i.error);
    if (!items.length || !navigator.onLine) { setQueue(q); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/offline-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
      if (!res.ok) { setQueue(load()); return; }
      const { results = [] } = await res.json();
      const byId = new Map(results.map((r) => [r.id, r]));
      const done = results.filter((r) => r.ok).length;
      const next = load().filter((i) => !byId.get(i.id)?.ok).map((i) => {
        const r = byId.get(i.id); return r && !r.ok && !r.skip && r.error ? { ...i, error: r.error } : i;
      });
      save(next); setQueue(next);
      if (done) setFlash(`✅ ${done} note${done === 1 ? '' : 's'} written offline ${done === 1 ? 'is' : 'are'} now saved in the portal.`);
    } catch { setQueue(load()); } finally { setBusy(false); }
  }, [userId]);

  useEffect(() => {
    setQueue(load()); setOnline(navigator.onLine);
    const onSubmit = (e) => {
      const form = e.target;
      const kind = form?.dataset?.offline;
      if (!kind || navigator.onLine) return;
      e.preventDefault(); e.stopPropagation();
      const fields = {};
      for (const [k, v] of new FormData(form, e.submitter ?? undefined).entries()) if (typeof v === 'string') fields[k] = v;
      if (kind === 'note' && !(fields.note ?? '').trim()) { setFlash('Write the note first.'); return; }
      const item = { id: uuid(), userId, kind, fields, writtenAt: new Date().toISOString(), page: location.pathname };
      const q = [...load(), item];
      if (!save(q)) { setFlash('⚠ This device could not keep the note (storage full). Write it on paper and enter it when the internet is back.'); return; }
      setQueue(q);
      if (kind === 'note' && fields.resident_id) {
        try { Object.keys(localStorage).filter((k) => k.startsWith(`evg-note:${fields.resident_id}:`)).forEach((k) => localStorage.removeItem(k)); } catch {}
      }
      form.reset?.();
      setFlash('📴 No internet — this note is kept on this device. It uploads by itself when the internet is back. Don’t clear the browser or sign out of this device.');
    };
    const up = () => { setOnline(true); sync(); };
    const down = () => setOnline(false);
    document.addEventListener('submit', onSubmit, true);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    sync();
    const t = setInterval(sync, 60000);
    return () => { document.removeEventListener('submit', onSubmit, true); window.removeEventListener('online', up); window.removeEventListener('offline', down); clearInterval(t); };
  }, [sync, userId]);

  const dismiss = (id) => { const q = load().filter((i) => i.id !== id); save(q); setQueue(q); };
  if (online && !mine.length && !flash) return null;

  return (
    <div className="no-print" role="status" style={{ position: 'sticky', top: 0, zIndex: 50, margin: '0 0 8px' }}>
      {!online && <p className="message" style={{ margin: 0 }}>📴 <strong>No internet.</strong> You can keep writing daily notes and records — they are kept on this device and upload when the internet is back. Keep this page open.</p>}
      {waiting.length > 0 && <p className="message" style={{ margin: '4px 0 0' }}>⏳ {waiting.length} note{waiting.length === 1 ? '' : 's'} waiting to upload{busy ? ' — uploading…' : online ? '' : ' (no internet yet)'}. {online && !busy && <button type="button" className="link" onClick={sync}>Upload now</button>}</p>}
      {failed.map((i) => (
        <p key={i.id} className="message" style={{ margin: '4px 0 0' }}>
          ⚠ A note written {new Date(i.writtenAt).toLocaleString('en-CA', { timeZone: 'Etc/GMT+7', dateStyle: 'medium', timeStyle: 'short' })} could not be saved: {i.error}
          {i.fields?.note && <><br /><em>“{i.fields.note.slice(0, 200)}{i.fields.note.length > 200 ? '…' : ''}”</em></>}
          <br /><span className="small">Write it again, then <button type="button" className="link" onClick={() => dismiss(i.id)}>remove this message</button>.</span>
        </p>
      ))}
      {flash && <p className="message ok" style={{ margin: '4px 0 0' }}>{flash} <button type="button" className="link small" onClick={() => setFlash(null)}>OK</button></p>}
    </div>
  );
}
