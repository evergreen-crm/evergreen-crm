// Send a document for signature (supabase/sign-requests.sql + sign-external.sql): shared labels and rules.
// These only decide what to show; the database checks the same rules again.
import { levelOf, groupOf } from '@/lib/levels';

export const SIGN_CATEGORIES = [
  'Letter of Expectation', 'Coaching record', 'Commendation', 'Contract or job change', 'Schedule agreement',
  'Policy or procedure (one person)', 'Training acknowledgement', 'Safety plan / house rules', 'Confidentiality agreement',
  'Consent / release of information', 'Care plan or agreement', 'Medical form', 'Other',
];

// Program Coordinator (level 2, not HR/payroll), Program Manager and up can send.
export function canSend(profile) {
  const lvl = levelOf(profile);
  return lvl >= 3 || (lvl === 2 && !groupOf(profile));
}
// Directors and up (level 4+) can send to staff at any house and choose which house a request belongs to.
export const canSendAnyHouse = (profile) => levelOf(profile) >= 4;
// Level 6 and up (CSO, CEO, Admin) see every house's requests and signatures.
export const seesAllHouses = (profile) => levelOf(profile) >= 6;
// May follow up this request: the sender, level 6+, or a sender-level person at the request's house.
export const canManageRequest = (profile, r) =>
  r.created_by === profile.id || seesAllHouses(profile) || (canSend(profile) && !!r.home_id && r.home_id === profile.home_id);

export const signerName = (s) => s?.profiles?.full_name ?? s?.ext_name ?? '—';
export const signerAbout = (s) => (s?.profile_id
  ? (s.profiles?.homes?.name ?? 'Staff')
  : [s?.ext_role, s?.ext_org].filter(Boolean).join(' · ') || 'Outside signer');

export const SIGNER_BADGE = { Waiting: 'warn', Signed: '', Declined: 'bad' };
export const REQUEST_BADGE = { Open: 'warn', Complete: '', Cancelled: 'bad' };
