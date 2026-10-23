'use client';
// Upload files straight from the browser to private Supabase Storage, then save their details.
// Files go in a folder named after the house. You can pick several files at once, and a .zip
// is unpacked automatically: every file inside is saved as its own document.
// Photos are made smaller before upload (lib/compressImage.js) unless "Keep original" is ticked.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addDocument } from '@/app/residents/modules';
import { unzip, isZip } from '@/lib/unzip';
import { compressImage, fmtSize } from '@/lib/compressImage';
import { MAX_FILE as MAX, MAX_ZIP, MAX_RAW_PHOTO as MAX_PHOTO, MAX_LABEL, TOO_BIG, OTHER_ARCHIVE_MSG, isOtherArchive, contentTypeFor } from '@/lib/uploadRules';

export default function DocUpload({ homeId, residentId, categories }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const picked = [...form.file.files];
    if (!picked.length) return;
    setBusy(true); setMsg(null); setProgress('Getting files ready…');

    // 1. Unpack any zips.
    const found = [], skipped = [];
    for (const f of picked) {
      if (isOtherArchive(f)) { skipped.push({ name: f.name, reason: OTHER_ARCHIVE_MSG }); continue; }
      if (isZip(f)) {
        if (f.size > MAX_ZIP) { skipped.push({ name: f.name, reason: `zip is over ${fmtSize(MAX_ZIP)}` }); continue; }
        try {
          setProgress(`Unpacking ${f.name}…`);
          const r = await unzip(f, { maxFileBytes: MAX_PHOTO });
          found.push(...r.files); skipped.push(...r.skipped);
        } catch (err) { skipped.push({ name: f.name, reason: err.message }); }
      } else found.push(f);
    }

    // 2. Make photos smaller (unless "Keep original" is ticked), then check sizes.
    const keepOriginal = form.keep_original.checked;
    const files = [];
    let savedBytes = 0, shrunk = 0;
    for (const f of found) {
      let file = f;
      if (!keepOriginal && f.size <= MAX_PHOTO) {
        setProgress(`Making photos smaller: ${f.name}`);
        const r = await compressImage(f);
        if (r.saved > 0) { file = r.file; savedBytes += r.saved; shrunk++; }
      }
      if (file.size > MAX) skipped.push({ name: f.zipPath ?? f.name, reason: `${fmtSize(file.size)} — ${TOO_BIG}` });
      else files.push(file);
    }

    // 3. Upload each file and save it as a document.
    const supabase = createClient();
    const typedTitle = form.title.value.trim();
    const useTitle = typedTitle && files.length === 1;
    let done = 0;
    for (const file of files) {
      setProgress(`Uploading ${done + 1} of ${files.length}: ${file.name}`);
      const safe = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${homeId}/${residentId ?? 'house'}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: contentTypeFor(file) });
      if (error) { skipped.push({ name: file.name, reason: 'upload failed: ' + error.message }); continue; }
      const title = useTitle ? typedTitle : typedTitle ? `${typedTitle} – ${file.name}` : (file.zipPath ?? file.name);
      const res = await addDocument({
        home_id: homeId, resident_id: residentId, file_path: path, file_size: file.size,
        title, category: form.category.value || null,
      });
      if (res?.error) { skipped.push({ name: file.name, reason: 'could not save: ' + res.error }); continue; }
      done++;
    }

    setBusy(false); setProgress(null);
    if (done) form.reset();
    setMsg({
      bad: done === 0,
      text: done === 0 ? 'Nothing was uploaded.'
        : `Uploaded ${done} file${done > 1 ? 's' : ''}.${shrunk ? ` ${shrunk} photo${shrunk > 1 ? 's' : ''} made smaller — saved ${fmtSize(savedBytes)}.` : ''}`,
      skipped,
    });
    if (done) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card no-print">
      <h3>Upload documents</h3>
      <div className="row">
        <label>Files (PDF, Word, photos — max {MAX_LABEL} each). A <strong>.zip</strong> is unpacked automatically.
          <input type="file" name="file" multiple required />
        </label>
        <label>Title<input name="title" placeholder="Leave blank to use the file names" /></label>
        <label>Category (applies to all)
          <select name="category" defaultValue="">
            <option value="">—</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <label className="check small"><input type="checkbox" name="keep_original" /> Keep original photo quality (photos are made smaller automatically — tick only when fine detail matters)</label>
      <button disabled={busy}>{busy ? 'Working…' : 'Upload'}</button>
      {progress && <p className="muted small">{progress}</p>}
      {msg && (
        <div className={`message ${msg.bad ? '' : 'ok'}`}>
          {msg.text}
          {msg.skipped.length > 0 && (
            <>
              <br /><strong>Not uploaded ({msg.skipped.length}):</strong>
              <ul className="small" style={{ margin: '4px 0 0' }}>
                {msg.skipped.map((s, i) => <li key={i}>{s.name} — {s.reason}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </form>
  );
}
