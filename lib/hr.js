// Shared HR helpers.

export const CERT_TYPES = [
  'First Aid & CPR (Level C minimum)',
  'Medication Administration',
  'Criminal Record Check (incl. Vulnerable Sector)',
  'Food Safe',
  'Non-Violent Crisis Intervention',
  "Driver's Licence",
  'TB Test',
  'Other',
];

// Status of one certificate based on its expiry date.
export function certStatus(expiresOn) {
  if (!expiresOn) return { key: 'none', label: 'No expiry' };
  const today = new Date(new Date().toISOString().slice(0, 10));
  const days = Math.round((new Date(expiresOn) - today) / 86400000);
  if (days < 0) return { key: 'expired', label: `Expired ${-days} day${days === -1 ? '' : 's'} ago` };
  if (days <= 30) return { key: 'soon', label: `Expires in ${days} day${days === 1 ? '' : 's'}` };
  return { key: 'ok', label: `Valid until ${expiresOn}` };
}

// Worst status across a person's certificates (for the staff list).
export function summarize(certs = []) {
  let expired = 0, soon = 0;
  for (const c of certs) {
    const s = certStatus(c.expires_on).key;
    if (s === 'expired') expired++;
    if (s === 'soon') soon++;
  }
  return { expired, soon, total: certs.length };
}
