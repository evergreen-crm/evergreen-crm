// House inventory register: phones, tablets, equipment the house buys or adds.
// Serial number, SKU and IMEI are recorded once and cannot be changed. Photos can be added to any item.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import { addInventoryItem } from '@/app/homes/inventory-actions';
import InventoryPhotos from '@/app/homes/InventoryPhotos';

export default async function InventoryRegister({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(null);
  const { data: home } = await supabase.from('homes').select('id, name').eq('id', id).maybeSingle();
  if (!home) notFound();

  const { data: items } = await supabase.from('inventory_items')
    .select('id, category, item, sku, serial_no, imei, bought_on, added_by_note, status, created_at')
    .eq('home_id', id).order('created_at', { ascending: false });
  const ids = (items ?? []).map((i) => i.id);
  const { data: photos } = ids.length
    ? await supabase.from('inventory_photos').select('id, item_id, file_path, caption, taken_on, created_at').in('item_id', ids).order('created_at')
    : { data: [] };

  // Signed links for each photo (private bucket, valid one hour).
  const photoList = [];
  for (const p of photos ?? []) {
    const { data } = await supabase.storage.from('inventory-photos').createSignedUrl(p.file_path, 3600);
    photoList.push({ ...p, url: data?.signedUrl ?? null });
  }
  const canAdd = levelOf(profile) >= 2 || ['admin', 'manager'].includes(profile.role);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(new Date());

  return (
    <div>
      <p className="small"><Link href={`/homes/${id}`}>← Back to {home.name}</Link></p>
      <h1>Inventory register: {home.name}</h1>
      <div className="message" style={{ marginBottom: 12 }}>
        <strong>How this works:</strong> record each phone, tablet or item the house buys or adds, with its serial number, SKU and (for phones) IMEI.
        Once saved, these numbers cannot be changed. If a number was typed wrong, tell Melvin or an administrator. Photos can be added to any item at any time.
        Staff, coordinators, managers and directors can see this register.
      </div>

      {canAdd ? (
        <section className="card doc-form">
          <h2 style={{ marginTop: 0 }}>Add an item</h2>
          <form action={addInventoryItem}>
            <input type="hidden" name="home_id" value={id} />
            <div className="row">
              <div>
                <label htmlFor="inv-item">What is it?</label>
                <input id="inv-item" name="item" required placeholder="e.g. Samsung A15 phone" />
              </div>
              <div>
                <label htmlFor="inv-cat">Type</label>
                <select id="inv-cat" name="category" defaultValue="phone">
                  <option value="phone">Phone</option>
                  <option value="tablet">Tablet</option>
                  <option value="computer">Computer</option>
                  <option value="equipment">Equipment</option>
                  <option value="furniture">Furniture</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="row">
              <div>
                <label htmlFor="inv-sku">SKU number</label>
                <input id="inv-sku" name="sku" />
              </div>
              <div>
                <label htmlFor="inv-serial">Serial number</label>
                <input id="inv-serial" name="serial_no" />
              </div>
              <div>
                <label htmlFor="inv-imei">IMEI (phones: 15 digits)</label>
                <input id="inv-imei" name="imei" inputMode="numeric" maxLength={20} />
              </div>
            </div>
            <div className="row">
              <div>
                <label htmlFor="inv-bought">Date bought or added</label>
                <input id="inv-bought" name="bought_on" type="date" defaultValue={today} max={today} />
              </div>
              <div>
                <label htmlFor="inv-note">Bought or added, from where</label>
                <input id="inv-note" name="added_by_note" placeholder="e.g. Bought, from Best Buy, invoice in office" />
              </div>
              <div>
                <label htmlFor="inv-status">Status</label>
                <select id="inv-status" name="status" defaultValue="in use">
                  <option>in use</option><option>stored</option><option>lost</option><option>retired</option>
                </select>
              </div>
            </div>
            {sp.error && <p className="alert">{sp.error}</p>}
            <button type="submit">Save item (numbers locked after saving)</button>
          </form>
        </section>
      ) : (
        <p className="muted small">You can see the register. Coordinators, managers and directors add items.</p>
      )}

      <section className="card" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Items ({items?.length ?? 0})</h2>
        {!items?.length && <p className="muted">No items recorded yet.</p>}
        {items?.map((i) => (
          <details key={i.id} style={{ borderTop: '1px solid var(--line, #ddd)', padding: '10px 0' }}>
            <summary>
              <strong>{i.item}</strong> <span className="small muted">· {i.category} · {i.status} · added {fmtDate(i.created_at.slice(0, 10))}</span>
            </summary>
            <dl className="small" style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 12px', margin: '8px 0' }}>
              <dt>SKU</dt><dd>{i.sku || '—'}</dd>
              <dt>Serial number</dt><dd>{i.serial_no || '—'}</dd>
              {i.imei && <><dt>IMEI</dt><dd>{i.imei}</dd></>}
              <dt>Bought or added</dt><dd>{i.bought_on ? fmtDate(i.bought_on) : '—'}{i.added_by_note ? ` · ${i.added_by_note}` : ''}</dd>
            </dl>
            <InventoryPhotos
              itemId={i.id}
              homeId={id}
              path={`/homes/${id}/inventory`}
              canAdd={canAdd}
              photos={photoList.filter((p) => p.item_id === i.id)}
            />
          </details>
        ))}
      </section>
    </div>
  );
}
