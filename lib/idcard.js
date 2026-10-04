// Digital staff ID cards and shift check-ins: shared helpers.
import 'server-only';
import { headers } from 'next/headers';
import QRCode from 'qrcode';

export const CHECKIN_EVERY_HOURS = 3;   // keep in step with checkin_reminders() in supabase/id-cards.sql
export const CARD_VALID_MONTHS = 12;

// Same rule as verify_id_card() in the database.
export function cardStatus({ card, details, active = true, today }) {
  if (!active || (details?.employment_status ?? 'Active') !== 'Active') return 'Not active';
  if (!card?.issued_on || card.photo_status !== 'Approved') return 'Not issued';
  if (card.expires_on && card.expires_on < today) return 'Expired';
  return 'Valid';
}

export async function siteOrigin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function qrSvg(text) {
  return QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0f3059', light: '#ffffff' } });
}

export function emergencyFor(details, onb) {
  const p = onb?.personal ?? {};
  const name = p.emergency_name
    ? `${p.emergency_name}${p.emergency_relationship ? ` (${p.emergency_relationship})` : ''}`
    : details?.emergency_contact;
  return { name: name ?? null, phone: p.emergency_phone ?? details?.emergency_phone ?? null };
}

export function fmtDistance(m) {
  if (m == null) return null;
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
