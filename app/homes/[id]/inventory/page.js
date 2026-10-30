// House inventory register: phones, tablets, equipment the house buys or adds.
// Serial number, SKU and IMEI are recorded once; only an Administrator can correct them (with a reason).
// Coordinators and up change an item's status (in use, stored, lost, retired). Every change is kept in the item's history.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { fmtDate } from '@/lib/options';
import { addInventoryItem, setInventoryStatus, correctInventoryItem } from '@/app/homes/inventory-actions';
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

  const { data: changes } = ids.length
    ? await supabase.from('inventory_changes').select('id, item_id, kind, old_values, new_values, reason, changed_at, who:changed_by(full_name)').in('item_id', ids).order('changed_at', { ascending: false })
    : { data: [] };
  const FIELD = { item: 'Name', sku: 'SKU', serial_no: 'Serial number', imei: 'IMEI', status: 'Status' };
  const show = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

  // Signed links for each photo (private bucket, valid one hour).
  const photoList = [];
  for (const p of photos ?? []) {
    const { data } = await supabase.storage.from('inventory-photos').createSignedUrl(p.file_path, 3600);
    photoList.push({ ...p, url: data?.signedUrl ?? null });
  }
  const canAdd = levelOf(profile) >= 2 || ['admin', 'manager'].includes(profile.role);
  const isAdmin = profile.role === 'admin';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Etc/GMT+7' }).format(new Date());

  return (
    <div>
      <p className="small"><Link href={`/homes/${id}`}>← Back to {home.name}</Link></p>
      <h1>Inventory register: {home.name}</h1>
      <div className="message" style={{ marginBottom: 12 }}>
        <strong>How this works:</strong> record each phone, tablet or item the house buys or adds, with its serial number, SKU and (for phones) IMEI.
        Once saved, these numbers are locked. If a number was typed wrong, an administrator can correct it (the old number is kept in the item's history).
        Coordinators, managers and directors can mark an item in use, stored, lost or retired. Photos can be added to any item at any time.
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
            {canAdd && (
              <form action={setInventoryStatus} className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', margin: '8px 0' }}>
                <input type="hidden" name="item_id" value={i.id} />
                <input type="hidden" name="home_id" value={id} />
                <div>
                  <label htmlFor={`st-${i.id}`} className="small">Change status</label>
                  <select id={`st-${i.id}`} name="status" defaultValue={i.status}>
                    <option>in use</option><option>stored</option><option>lost</option><option>retired</option>
                  </select>
                </div>
                <div style={{ flex: '1 1 220px' }}>
                  <label htmlFor={`sr-${i.id}`} className="small">Why</label>
                  <input id={`sr-${i.id}`} name="reason" required maxLength={500} placeholder="e.g. Phone lost on outing, reported to PM" />
                </div>
                <button type="submit" className="secondary">Save status</button>
              </form>
            )}
            {isAdmin && (
              <details className="no-print" style={{ margin: '8px 0' }}>
                <summary className="small">✏️ Correct numbers (Administrator)</summary>
                <form action={correctInventoryItem} style={{ marginTop: 8 }}>
                  <input type="hidden" name="item_id" value={i.id} />
                  <input type="hidden" name="home_id" value={id} />
                  <div className="row">
                    <div><label htmlFor={`cn-${i.id}`}>What is it?</label><input id={`cn-${i.id}`} name="item" defaultValue={i.item} required /></div>
                    <div><label htmlFor={`cs-${i.id}`}>SKU number</label><input id={`cs-${i.id}`} name="sku" defaultValue={i.sku ?? ''} /></div>
                  </div>
                  <div className="row">
                    <div><label htmlFor={`cr-${i.id}`}>Serial number</label><input id={`cr-${i.id}`} name="serial_no" defaultValue={i.serial_no ?? ''} /></div>
                    <div><label htmlFor={`ci-${i.id}`}>IMEI (phones: 15 digits)</label><input id={`ci-${i.id}`} name="imei" inputMode="numeric" maxLength={20} defaultValue={i.imei ?? ''} /></div>
                  </div>
                  <label htmlFor={`cw-${i.id}`}>Why is this being corrected?</label>
                  <input id={`cw-${i.id}`} name="reason" required maxLength={500} placeholder="e.g. Serial typed wrong; checked against the box" />
                  <button type="submit">Save correction (old numbers kept in history)</button>
                </form>
              </details>
            )}
            {changes?.some((c) => c.item_id === i.id) && (
              <div className="small" style={{ margin: '8px 0' }}>
                <strong>History</strong>
                <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                  {changes.filter((c) => c.item_id === i.id).map((c) => (
                    <li key={c.id}>
                      {new Date(c.changed_at).toLocaleString('en-CA', { timeZone: 'Etc/GMT+7', dateStyle: 'medium', timeStyle: 'short' })} · {c.who?.full_name ?? 'someone'} ·{' '}
                      {Object.keys(c.new_values).map((k) => `${FIELD[k] ?? k}: ${show(c.old_values[k])} → ${show(c.new_values[k])}`).join('; ')}
                      {' '}· <em>{c.reason}</em>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
