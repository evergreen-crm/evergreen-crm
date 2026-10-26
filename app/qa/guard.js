// Every QA page starts here: signed in, level 4+ (Director of Operations and up), and the view is logged.
import 'server-only';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canSeeQa, logQaView } from '@/lib/qa';

export async function requireQa(page) {
  const res = await requireUser(['admin', 'manager']);
  if (!canSeeQa(res.profile)) redirect('/?error=' + encodeURIComponent('The quality assurance portal is for the Director of Operations and up.'));
  await logQaView(res.supabase, page);
  return res;
}
