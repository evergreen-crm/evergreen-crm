'use server';
// Houses and resident profiles: saving.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

const HOME_FIELDS = ['name', 'address', 'phone', 'licence_number', 'house_type', 'notes'];

export async function createHome(formData) {
  const { supabase } = await requireUser(['admin']);
  const row = Object.fromEntries(HOME_FIELDS.map((k) => [k, text(formData, k)]));
  row.capacity = text(formData, 'capacity');
  const { data, error } = await supabase.from('homes').insert(row).select('id').single();
  if (error) throw new Error('Could not add house: ' + error.message);
  revalidatePath('/homes');
  redirect(`/homes/${data.id}`);
}

export async function updateHome(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const id = text(formData, 'id');
  const row = Object.fromEntries(HOME_FIELDS.map((k) => [k, text(formData, k)]));
  row.capacity = text(formData, 'capacity');
  if (formData.has('lat')) {
    const n = (k, lo, hi) => { const v = Number(text(formData, k)); return text(formData, k) !== null && Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
    row.lat = n('lat', -90, 90);
    row.lng = n('lng', -180, 180);
    row.geofence_m = Math.round(n('geofence_m', 25, 2000) ?? 100);
  }
  if (formData.has('on_call_phone')) row.on_call_phone = text(formData, 'on_call_phone');
  let { error } = await supabase.from('homes').update(row).eq('id', id);
  if (error && /on_call_phone/.test(error.message)) {  // safe-shifts.sql not run yet: save the rest
    delete row.on_call_phone;
    ({ error } = await supabase.from('homes').update(row).eq('id', id));
  }
  if (error) throw new Error('Could not save house: ' + error.message);
  revalidatePath(`/homes/${id}`);
  revalidatePath('/homes');
  redirect(`/homes/${id}`);
}

const RESIDENT_FIELDS = [
  'home_id', 'first_name', 'last_name', 'preferred_name', 'date_of_birth', 'gender', 'care_type',
  'status', 'admission_date', 'discharge_date', 'funder', 'file_number',
  'case_worker_name', 'case_worker_phone', 'case_worker_email',
  'guardian_name', 'guardian_relationship', 'guardian_phone', 'guardian_email', 'funder_contact_name', 'funder_contact_email',
  'emergency_contact_name', 'emergency_contact_phone',
  'phn', 'doctor_name', 'doctor_phone', 'allergies', 'diagnoses', 'medications_summary',
  'dietary_needs', 'behaviour_support_notes', 'school_or_day_program',
  'care_plan_review_date', 'profile_notes',
];

function residentRow(formData) {
  const row = Object.fromEntries(RESIDENT_FIELDS.map((k) => [k, text(formData, k)]));
  if (!row.status) row.status = 'active';
  for (const flag of ['is_indigenous', 'has_bsp', 'on_medication']) row[flag] = formData.get(flag) === 'on';
  return row;
}

export async function createResident(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const row = residentRow(formData);
  const { data, error } = await supabase.from('residents').insert(row).select('id').single();
  if (error) throw new Error('Could not add resident: ' + error.message);
  revalidatePath(`/homes/${row.home_id}`);
  redirect(`/residents/${data.id}`);
}

export async function updateResident(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const id = text(formData, 'id');
  const row = residentRow(formData);
  const { error } = await supabase.from('residents').update(row).eq('id', id);
  if (error) throw new Error('Could not save resident: ' + error.message);
  revalidatePath(`/residents/${id}`);
  revalidatePath(`/homes/${row.home_id}`);
  redirect(`/residents/${id}`);
}

// "Find from address": OpenStreetMap (Nominatim) lookup for a Canadian street address. Returns { lat, lng, label }.
export async function geocodeAddress(address) {
  await requireUser(['admin', 'manager']);
  const q = String(address ?? '').trim().slice(0, 200);
  if (!q) return { error: 'Type the street address first.' };
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ca&addressdetails=0&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'EvergreenCommunityCare-CRM/1.0 (house locations)', 'Accept-Language': 'en-CA' }, cache: 'no-store' });
    if (!res.ok) return { error: 'The address lookup isn’t answering right now. Try again, or use “Use my current location” at the house.' };
    const [hit] = await res.json();
    if (!hit) return { error: 'Address not found. Check the spelling and include the city (e.g. 123 Main St, Surrey BC).' };
    return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name };
  } catch {
    return { error: 'Couldn’t reach the address lookup. Try again, or use “Use my current location” at the house.' };
  }
}
