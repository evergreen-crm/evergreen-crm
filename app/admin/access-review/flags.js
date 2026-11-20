// What to check for each account in the monthly access review.
import { fmtDate } from '@/lib/options';

const daysSince = (ts) => (ts ? Math.floor((Date.now() - new Date(ts)) / 86400000) : null);

export function flagsFor(p, today) {
  const f = [];
  const d = daysSince(p.last_sign_in);
  if (p.active && p.last_day && p.last_day < today) f.push(`Left on ${fmtDate(p.last_day)} but the account is still on`);
  if (p.active && d === null && daysSince(p.created_at) > 14) f.push('Never signed in (added more than 14 days ago)');
  if (p.active && d !== null && d >= 30) f.push(`Not signed in for ${d} days`);
  if (p.active && (p.role === 'admin' || (p.level ?? 0) >= 6)) f.push('Top-level access (sees every house) — confirm it is still needed');
  if (p.active && p.extra_homes) f.push('Has a second house');
  if (p.active && p.section_overrides > 0) f.push(`${p.section_overrides} personal section setting${p.section_overrides === 1 ? '' : 's'}`);
  if (!p.active && (p.extra_homes || p.prescreen)) f.push('Account off, but still listed on a house or pre-screening');
  return f;
}

