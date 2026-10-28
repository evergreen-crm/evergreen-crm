'use client';
// Photos for one inventory item: shows the saved photos and lets coordinators and up add more.
// The file goes to the private inventory-photos bucket, then its record is saved on the item.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addInventoryPhotoRecord } from '@/app/homes/inventory-actions';

export default function InventoryPhotos({ itemId, homeId, photos = [], canAdd }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMsg('Please choose a picture file.'); return; }
    setBusy(true); setMsg('Uploading…');
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${homeId}/${itemId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await createClient().storage.from('inventory-photos').upload(path, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      const fd = new FormData();
      fd.set('item_id', itemId); fd.set('home_id', homeId); fd.set('file_path', path);
      fd.set('taken_on', new Date().toISOString().slice(0, 10));
      await addInventoryPhotoRecord(fd);
      setMsg('Photo added. Refreshing…');
      window.location.reload();
    } catch (err) {
      setMsg('Could not add the photo: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="small"><strong>Photos ({photos.length})</strong></div>
      {photos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '6px 0' }}>
          {photos.map((p) => (
            <a key={p.id} href={p.url ?? '#'} target="_blank" rel="noopener noreferrer">
              {p.url ? <img src={p.url} alt={p.caption || 'Item photo'} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 6 }} /> : <span className="small muted">Photo unavailable</span>}
            </a>
          ))}
        </div>
      )}
      {canAdd && (
        <div style={{ marginTop: 6 }}>
          <label htmlFor={`photo-${itemId}`} className="small">Add a photo</label>
          <input id={`photo-${itemId}`} type="file" accept="image/*" capture="environment" disabled={busy} onChange={onFile} />
          {msg && <p className="small muted" style={{ margin: '4px 0 0' }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}
