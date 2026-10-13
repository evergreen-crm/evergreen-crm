'use client';
// HR: attach your own offer letter (PDF or Word) to a draft offer. Saved privately in the person's staff file.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { attachOfferFile } from './actions';

export default function OfferUpload({ offerId, profileId, fileName }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();
  async function onChange(e) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { setMsg('That file is over 25 MB.'); return; }
    setBusy(true); setMsg(null);
    const path = `${profileId}/offer-${offerId}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
    const { error } = await createClient().storage.from('staff-files').upload(path, f, { upsert: true, contentType: f.type || undefined });
    if (error) { setBusy(false); setMsg('Upload failed: ' + error.message); return; }
    const res = await attachOfferFile({ id: offerId, path, name: f.name });
    setBusy(false);
    if (res?.error) { setMsg(res.error); return; }
    router.refresh();
  }
  return (
    <label className="small no-print" style={{ fontWeight: 400 }}>
      {busy ? 'Uploading…' : fileName ? `📎 ${fileName} — replace` : '📎 Upload your own offer letter (PDF or Word, optional)'}
      <input type="file" accept=".pdf,.doc,.docx" onChange={onChange} disabled={busy} style={{ padding: 4 }} />
      {msg && <span className="bad-text"> {msg}</span>}
    </label>
  );
}
