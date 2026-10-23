'use client';
// HR: attach your own offer letter (PDF or Word) to a draft offer. Saved privately in the person's staff file.
// Uses lib/uploadRules.js: a zip with one file is unpacked, max 10 MB.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { prepareOne, contentTypeFor, MAX_LABEL } from '@/lib/uploadRules';
import { attachOfferFile } from './actions';

export default function OfferUpload({ offerId, profileId, fileName }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();
  async function onChange(e) {
    const picked = e.target.files[0]; e.target.value = '';
    if (!picked) return;
    setBusy(true); setMsg(null);
    const ready = await prepareOne(picked);
    if (ready.error) { setBusy(false); setMsg(ready.error); return; }
    const f = ready.file;
    const path = `${profileId}/offer-${offerId}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
    const { error } = await createClient().storage.from('staff-files').upload(path, f, { upsert: true, contentType: contentTypeFor(f) });
    if (error) { setBusy(false); setMsg('Upload failed: ' + error.message); return; }
    const res = await attachOfferFile({ id: offerId, path, name: f.name });
    setBusy(false);
    if (res?.error) { setMsg(res.error); return; }
    router.refresh();
  }
  return (
    <label className="small no-print" style={{ fontWeight: 400 }}>
      {busy ? 'Uploading…' : fileName ? `📎 ${fileName} — replace` : `📎 Upload your own offer letter (PDF or Word, max ${MAX_LABEL}, optional)`}
      <input type="file" accept=".pdf,.doc,.docx,.zip" onChange={onChange} disabled={busy} style={{ padding: 4 }} />
      {msg && <span className="bad-text"> {msg}</span>}
    </label>
  );
}
