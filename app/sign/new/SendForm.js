'use client';
// Send a document for signature:
// 1. the document (lib/uploadRules.js: 10 MB, single-file zips unpacked, photos made smaller),
// 2. who signs — staff, and outside people by email (name, occupation, organization, phone),
// 3. on a PDF, boxes placed on the page for each person (signature, initials, date, name, text, checkbox).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { prepareOne, contentTypeFor, MAX_LABEL } from '@/lib/uploadRules';
import { sendForSignature } from '@/app/sign/actions';
import { PERSON_COLORS, toPdfRect } from '@/app/sign/PdfPages';
import BoxEditor from './BoxEditor';

const OK_TYPES = /\.(pdf|docx?|jpe?g|png|webp|heic|heif)$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLES = ['Social worker', 'Guardianship worker', 'Resource worker', 'CLBC facilitator', 'Doctor', 'Nurse', 'Psychiatrist', 'Psychologist',
  'Therapist / counsellor', 'Parent', 'Guardian', 'Lawyer', 'Probation officer', 'Teacher / school staff', 'Youth (in care)', 'Other professional'];
const blankOutside = () => ({ name: '', email: '', role: '', org: '', phone: '', notes: '' });
const shortName = (n) => { const parts = String(n).trim().split(/\s+/); return parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : parts[0] || '?'; };

export default function SendForm({ people, categories, preset, minDue, defaultDue, userId, outsideOk, houses, defaultHouse, pickHouse }) {
  const [chosen, setChosen] = useState(new Set(preset));
  const [filter, setFilter] = useState('');
  const [outside, setOutside] = useState([]);
  const [doc, setDoc] = useState(null);         // { file, isPdf, data, note }
  const [boxes, setBoxes] = useState([]);
  const [placing, setPlacing] = useState(false);
  const [viewports, setViewports] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const by = {};
    for (const p of people) {
      if (f && !`${p.name} ${p.house} ${p.role}`.toLowerCase().includes(f)) continue;
      (by[p.house] ??= []).push(p);
    }
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }, [people, filter]);

  // Everyone signing, in one list (for the box colours and "Boxes for").
  const signers = useMemo(() => {
    const staff = people.filter((p) => chosen.has(p.id)).map((p) => ({ key: `p:${p.id}`, label: `${p.name} (staff)`, short: shortName(p.name) }));
    const ext = outside.filter((o) => o.name.trim() && EMAIL.test(o.email.trim()))
      .map((o) => ({ key: `e:${o.email.trim().toLowerCase()}`, label: `${o.name.trim()} (${o.role.trim() || 'outside'})`, short: shortName(o.name) }));
    return [...staff, ...ext].map((s, i) => ({ ...s, color: PERSON_COLORS[i % PERSON_COLORS.length] }));
  }, [people, chosen, outside]);
  const total = chosen.size + outside.length;
  const orphanBoxes = boxes.filter((b) => !signers.some((s) => s.key === b.who)).length;

  const toggle = (id) => setChosen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setHouse = (list, on) => setChosen((s) => { const n = new Set(s); list.forEach((p) => (on ? n.add(p.id) : n.delete(p.id))); return n; });
  const setOut = (i, k, v) => setOutside((l) => l.map((o, j) => (j === i ? { ...o, [k]: v } : o)));

  async function pickFile(e) {
    const picked = e.target.files?.[0];
    setDoc(null); setBoxes([]); setPlacing(false); setViewports(null); setMsg(null);
    if (!picked) return;
    const ready = await prepareOne(picked);
    if (ready.error) { setMsg(ready.error); e.target.value = ''; return; }
    if (!OK_TYPES.test(ready.file.name)) { setMsg('Please send a PDF, Word document or photo.'); e.target.value = ''; return; }
    const isPdf = /\.pdf$/i.test(ready.file.name);
    setDoc({ file: ready.file, isPdf, data: isPdf ? await ready.file.arrayBuffer() : null, note: ready.note });
    if (isPdf) setPlacing(true);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    if (!doc) { setMsg('Choose the document to send.'); return; }
    if (!total) { setMsg('Choose at least one person to sign.'); return; }
    for (const o of outside) {
      if (!o.name.trim() || !EMAIL.test(o.email.trim()) || !o.role.trim()) { setMsg('Each outside person needs a name, a working email and their occupation.'); return; }
    }
    if (doc.isPdf) {
      const noSign = signers.filter((p) => !boxes.some((b) => b.who === p.key && b.type === 'signature'));
      if (noSign.length) {
        setPlacing(true);
        setMsg(`Mark where each person signs: add a ✍️ Signature box for ${noSign.map((p) => p.label).join(', ')}. Pick the person under “Boxes for”, choose Signature, then click the spot on the page.`);
        return;
      }
    }
    if (orphanBoxes) { setMsg(`${orphanBoxes} box${orphanBoxes === 1 ? ' belongs' : 'es belong'} to someone who is no longer signing. Change who fills ${orphanBoxes === 1 ? 'it' : 'them'} or remove ${orphanBoxes === 1 ? 'it' : 'them'}.`); return; }
    if (boxes.length && !viewports) { setMsg('Wait for the document to finish opening, then try again.'); return; }
    setBusy(true); setMsg(null);
    const file = doc.file;
    let hash = null;
    try {
      const d = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      hash = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {}
    const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
    const { error } = await createClient().storage.from('sign-docs').upload(path, file, { contentType: contentTypeFor(file) });
    if (error) {
      setBusy(false);
      setMsg(/bucket/i.test(error.message) ? 'File storage for signatures isn’t switched on yet. Please tell the office (setup file: sign-requests.sql).'
        : /row-level|policy|permission/i.test(error.message) ? 'You don’t have permission to send documents for signature.' : 'Upload failed: ' + error.message);
      return;
    }
    const fields = boxes.map((b) => ({ id: b.id, type: b.type, who: b.who, page: b.page, rect: toPdfRect(viewports[b.page], b), label: b.label, required: b.required }));
    const res = await sendForSignature({
      title: f.title.value, category: f.category.value, message: f.message.value, due: f.due.value, home: f.home?.value || null,
      file_path: path, file_name: file.name, file_type: contentTypeFor(file), file_size: file.size, doc_hash: hash,
      signers: [...chosen], external: outside, fields,
    });
    setBusy(false);
    if (res?.error) { setMsg(res.error); return; }
    router.push(`/sign/${res.id}?sent=1${res.failed?.length ? `&failed=${encodeURIComponent(res.failed.join(','))}` : ''}`);
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <div className="row">
        <label>Title (what they’re signing)<input name="title" required maxLength={200} placeholder="e.g., Consent to share information — J.D." /></label>
        <label>Type
          <select name="category" defaultValue="Other">{categories.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label>Sign by<input type="date" name="due" min={minDue} defaultValue={defaultDue} /></label>
        {pickHouse && (
          <label>House it belongs to
            <select name="home" defaultValue={defaultHouse ?? ''}>
              <option value="">Head office (no house)</option>
              {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <label>Document (a PDF lets you place boxes on the page; Word or a photo is fine too, max {MAX_LABEL})
        <input type="file" name="file" required accept=".pdf,.doc,.docx,image/*,.zip" onChange={pickFile} />
      </label>
      {doc?.note && <p className="muted small">{doc.note}</p>}
      <label>Message to the people signing (optional)<textarea name="message" rows={3} maxLength={4000} placeholder="Anything they should know before signing" /></label>

      <fieldset className="sign-who">
        <legend><strong>Staff who sign</strong> <span className="badge">{chosen.size} chosen</span></legend>
        <input type="search" placeholder="Find a name, house or role…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 8 }} />
        <div style={{ maxHeight: 300, overflow: 'auto' }}>
          {groups.map(([house, list]) => {
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
          {!groups.length && <p className="muted small">No staff match.</p>}
        </div>
      </fieldset>

      <fieldset className="sign-who">
        <legend><strong>Outside people who sign</strong> <span className="badge">{outside.length}</span></legend>
        {!outsideOk ? <p className="muted small">Email isn’t set up yet, so you can’t send to people outside Evergreen. Ask the administrator.</p> : <>
          <p className="muted small" style={{ marginTop: 0 }}>A social worker, doctor, parent, lawyer… They get an email with a private link and a 6-digit code — no account needed.</p>
          <datalist id="sign-roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist>
          {outside.map((o, i) => (
            <div key={i} className="outside-person">
              <div className="row">
                <label>Full name *<input value={o.name} maxLength={120} onChange={(e) => setOut(i, 'name', e.target.value)} placeholder="e.g. Sam Rivera" /></label>
                <label>Email *<input type="email" value={o.email} maxLength={160} onChange={(e) => setOut(i, 'email', e.target.value)} placeholder="name@gov.bc.ca" /></label>
                <label>Occupation *<input list="sign-roles" value={o.role} maxLength={120} onChange={(e) => setOut(i, 'role', e.target.value)} placeholder="e.g. Social worker" /></label>
              </div>
              <div className="row">
                <label>Organization<input value={o.org} maxLength={160} onChange={(e) => setOut(i, 'org', e.target.value)} placeholder="e.g. MCFD Surrey" /></label>
                <label>Phone<input value={o.phone} maxLength={40} onChange={(e) => setOut(i, 'phone', e.target.value)} /></label>
                <label>Details (for our records)<input value={o.notes} maxLength={1000} onChange={(e) => setOut(i, 'notes', e.target.value)} placeholder="e.g. Youth’s guardianship worker" /></label>
              </div>
              <button type="button" className="link small" onClick={() => setOutside((l) => l.filter((_, j) => j !== i))}>Remove this person</button>
            </div>
          ))}
          {outside.length < 25 && <button type="button" className="secondary" onClick={() => setOutside((l) => [...l, blankOutside()])}>+ Add an outside person</button>}
        </>}
      </fieldset>

      {doc?.isPdf && (
        <fieldset className="sign-who">
          <legend><strong>Where they sign</strong> <span className="badge">{boxes.length} box{boxes.length === 1 ? '' : 'es'}</span></legend>
          {!signers.length ? <p className="muted small">Choose who signs (above), then mark where each person signs on the page.</p>
            : <>
                <p className="small" style={{ marginTop: 0 }}><strong>Required:</strong> put a ✍️ <strong>Signature</strong> box where each person signs. You can also add initials, date, name, text and checkbox boxes. Drag to move, drag the corner to resize, click a box to change or remove it.</p>
                <p className="small" style={{ margin: '0 0 6px' }}>{signers.map((p) => {
                  const ok = boxes.some((b) => b.who === p.key && b.type === 'signature');
                  return <span key={p.key} className={`badge ${ok ? '' : 'warn'}`} style={{ marginRight: 4 }}>{ok ? '✓' : '✍️ needs a signature box:'} {p.short}</span>;
                })}</p>
                {placing ? <BoxEditor data={doc.data} people={signers} boxes={boxes} setBoxes={setBoxes} onViewports={setViewports} />
                  : <button type="button" className="secondary" onClick={() => setPlacing(true)}>📍 Mark where they sign</button>}
              </>}
          {orphanBoxes > 0 && <p className="message error small">{orphanBoxes} box{orphanBoxes === 1 ? '' : 'es'} belong to someone who is no longer signing — click {orphanBoxes === 1 ? 'it' : 'them'} to change who fills it, or remove.</p>}
        </fieldset>
      )}
      {doc && !doc.isPdf && <p className="message small">This isn’t a PDF, so you can’t mark where they sign — they’ll sign once at the end. To mark signature and fill-in spots, save it as a PDF first (in Word: File → Save as → PDF) and choose that file instead.</p>}

      <button disabled={busy} style={{ marginTop: 10 }}>{busy ? 'Sending…' : `Send to ${total || '…'} ${total === 1 ? 'person' : 'people'}`}</button>
      {msg && <p className="message error">{msg}</p>}
    </form>
  );
}
