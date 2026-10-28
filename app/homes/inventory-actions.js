'use server';
// House inventory register: add an item (locked once saved), and attach a photo to it.
// There is no edit or delete action: serial, SKU and IMEI cannot be changed from the app.
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

const CATEGORIES = ['phone', 'tablet', 'computer', 'equipment', 'furniture', 'other'];

export async function addInventoryItem(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const homeId = String(formData.get('home_id') ?? '');
  const item = String(formData.get('item') ?? '').trim();
  const category = CATEGORIES.includes(String(formData.get('category'))) ? String(formData.get('category')) : 'other';
  const sku = String(formData.get('sku') ?? '').trim() || null;
  const serial = String(formData.get('serial_no') ?? '').trim() || null;
  const imeiRaw = String(formData.get('imei') ?? '').replace(/\s+/g, '');
  const imei = imeiRaw || null;
  const boughtOn = String(formData.get('bought_on') ?? '') || null;
  const note = String(formData.get('added_by_note') ?? '').trim() || null;
  const status = String(formData.get('status') ?? 'in use').trim() || 'in use';
  if (!homeId || !item) throw new Error('Write what the item is first.');
  if (imei && !/^[0-9]{15}$/.test(imei)) throw new Error('IMEI must be 15 digits. Check the number and try again.');
  if (category === 'phone' && !imei) throw new Error('Phones need an IMEI number.');
  const { error } = await supabase.from('inventory_items').insert({
    home_id: homeId, item, category, sku, serial_no: serial, imei, bought_on: boughtOn,
    added_by_note: note, status, created_by: user.id,
  });
  if (error) throw new Error('Could not save the item: ' + error.message);
  revalidatePath(`/homes/${homeId}/inventory`);
}

// Called after the photo file is uploaded to the private inventory-photos bucket.
export async function addInventoryPhotoRecord(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const itemId = String(formData.get('item_id') ?? '');
  const homeId = String(formData.get('home_id') ?? '');
  const filePath = String(formData.get('file_path') ?? '');
  const caption = String(formData.get('caption') ?? '').trim() || null;
  const takenOn = String(formData.get('taken_on') ?? '') || null;
  if (!itemId || !homeId || !filePath.startsWith(`${homeId}/${itemId}/`)) throw new Error('The photo could not be linked to this item.');
  const { error } = await supabase.from('inventory_photos').insert({
    item_id: itemId, home_id: homeId, file_path: filePath, caption, taken_on: takenOn, added_by: user.id,
  });
  if (error) throw new Error('Could not save the photo: ' + error.message);
  revalidatePath(`/homes/${homeId}/inventory`);
}
