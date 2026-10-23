// Send a document for signature (supabase/sign-requests.sql): shared labels and rules.
import { levelOf, groupOf } from '@/lib/levels';

export const SIGN_CATEGORIES = [
  'Letter of Expectation', 'Coaching record', 'Commendation', 'Contract or job change', 'Schedule agreement',
  'Policy or procedure (one person)', 'Training acknowledgement', 'Safety plan / house rules', 'Confidentiality agreement', 'Other',
];

// HR and Program Manager and up can send to anyone; a Program Coordinator to staff at their own house.
export function canSend(profile) {
  const lvl = levelOf(profile);
  return lvl >= 3 || groupOf(profile) === 'hr' || (lvl === 2 && !groupOf(profile));
}
export const canManageAll = (profile) => levelOf(profile) >= 3 || groupOf(profile) === 'hr';

export const SIGNER_BADGE = { Waiting: 'warn', Signed: '', Declined: 'bad' };
export const REQUEST_BADGE = { Open: 'warn', Complete: '', Cancelled: 'bad' };
