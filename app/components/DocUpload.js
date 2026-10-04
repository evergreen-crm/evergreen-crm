'use client';
// Upload a file straight from the browser to private Supabase Storage,
// then save its details. Files go in a folder named after the house.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addDocument } from '@/app/residents/modules';

export default function DocUpload({ homeId, residentId, categories }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = form.file.files[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setMsg({ bad: true, text: 'That file is over 25 MB.' }); return; }
    setBusy(true); setMsg(null);
    const safe = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${homeId}/${residentId ?? 'house'}/${crypto.randomUUID()}-${safe}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type || undefined });
    if (error) { setBusy(false); setMsg({ bad: true, text: 'Upload failed: ' + error.message }); return; }
    const res = await addDocument({
      home_id: homeId, resident_id: residentId, file_path: path, file_size: file.size,
      title: form.title.value.trim() || file.name, category: form.category.value || null,
    });
    setBusy(false);
    if (res?.error) { setMsg({ bad: true, text: 'Could not save: ' + res.error }); return; }
    form.reset();
    setMsg({ bad: false, text: 'Uploaded.' });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card no-print">
      <h3>Upload a document</h3>
      <div className="row">
        <label>File (PDF, Word, photo — max 25 MB)<input type="file" name="file" required /></label>
        <label>Title<input name="title" placeholder="Leave blank to use the file name" /></label>
        <label>Category
          <select name="category" defaultValue="">
            <option value="">—</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <button disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
      {msg && <p className={`message ${msg.bad ? '' : 'ok'}`}>{msg.text}</p>}
    </form>
  );
}
