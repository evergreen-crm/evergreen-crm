'use client';
// Upload the document (lib/uploadRules.js: 10 MB, single-file zips unpacked, photos made smaller),
// work out its fingerprint (SHA-256), then create the request.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { prepareOne, contentTypeFor, MAX_LABEL } from '@/lib/uploadRules';
import { sendForSignature } from '@/app/sign/actions';

const OK_TYPES = /\.(pdf|docx?|jpe?g|png|webp|heic|heif)$/i;

export default function SendForm({ people, categories, preset, minDue, defaultDue, userId }) {
  const [chosen, setChosen] = useState(new Set(preset));
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  const houses = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const by = {};
    for (const p of people) {
      if (f && !`${p.name} ${p.house} ${p.role}`.toLowerCase().includes(f)) continue;
      (by[p.house] ??= []).push(p);
    }
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }, [people, filter]);

  const toggle = (id) => setChosen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setHouse = (list, on) => setChosen((s) => { const n = new Set(s); list.forEach((p) => (on ? n.add(p.id) : n.delete(p.id))); return n; });

  async function onSubmit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const picked = f.file.files[0];
    if (!picked) { setMsg('Choose the document to send.'); return; }
    if (!chosen.size) { setMsg('Choose at least one person to sign.'); return; }
    setBusy(true); setMsg(null);
    const ready = await prepareOne(picked);
    if (ready.error) { setBusy(false); setMsg(ready.error); return; }
    const file = ready.file;
    if (!OK_TYPES.test(file.name)) { setBusy(false); setMsg('Please send a PDF, Word document or photo.'); return; }
    let hash = null;
    try {
      const d = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      hash = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {}
    const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
    const { error } = await createClient().storage.from('sign-docs').upload(path, file, { contentType: contentTypeFor(file) });
    if (error) {
      setBusy(false);
      setMsg(/bucket/i.test(error.message) ? 'File storage for signatures isn’t switched on yet. Please tell the office (setup file: sign-requests.sql).' : 'Upload failed: ' + error.message);
      return;
    }
    const res = await sendForSignature({
      title: f.title.value, category: f.category.value, message: f.message.value, due: f.due.value,
      file_path: path, file_name: file.name, file_type: contentTypeFor(file), file_size: file.size, doc_hash: hash, signers: [...chosen],
    });
    setBusy(false);
    if (res?.error) { setMsg(res.error); return; }
    router.push(`/sign/${res.id}?sent=1`);
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <div className="row">
        <label>Title (what they’re signing)<input name="title" required maxLength={200} placeholder="e.g., Letter of Expectation #1 — late shift notes" /></label>
        <label>Type
          <select name="category" defaultValue="Other">{categories.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label>Sign by<input type="date" name="due" min={minDue} defaultValue={defaultDue} /></label>
      </div>
      <label>Document (PDF works best — Word or a photo is fine, max {MAX_LABEL})
        <input type="file" name="file" required accept=".pdf,.doc,.docx,image/*,.zip" />
      </label>
      <label>Message to the people signing (optional)<textarea name="message" rows={3} maxLength={4000} placeholder="Anything they should know before signing" /></label>

      <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
        <legend><strong>Who signs</strong> <span className="badge">{chosen.size} chosen</span></legend>
        <input type="search" placeholder="Find a name, house or role…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 8 }} />
        <div style={{ maxHeight: 340, overflow: 'auto' }}>
          {houses.map(([house, list]) => {
            const allOn = list.every((p) => chosen.has(p.id));
            return (
              <div key={house} style={{ marginBottom: 8 }}>
                <label className="check"><input type="checkbox" checked={allOn} onChange={(e) => setHouse(list, e.target.checked)} /> <strong>{house}</strong> <span className="muted small">(everyone)</span></label>
                {list.map((p) => (
                  <label key={p.id} className="check" style={{ marginLeft: 22 }}>
                    <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} /> {p.name} <span className="muted small">· {p.role}</span>
                  </label>
                ))}
              </div>
            );
          })}
          {!houses.length && <p className="muted small">No one matches.</p>}
        </div>
      </fieldset>

      <button disabled={busy} style={{ marginTop: 10 }}>{busy ? 'Sending…' : `Send to ${chosen.size || '…'} ${chosen.size === 1 ? 'person' : 'people'}`}</button>
      {msg && <p className="message error">{msg}</p>}
    </form>
  );
}
