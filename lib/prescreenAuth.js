// Prescreening access check: the administrator, or someone the administrator granted access to.
import 'server-only';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

// Returns the usual user info plus prescreenRole: 'admin' | 'hr' | 'interviewer'.
export async function requirePrescreen(allowed = ['admin', 'hr', 'interviewer']) {
  const res = await requireUser(['admin', 'manager', 'staff']);
  const { data: role } = await res.supabase.rpc('prescreen_role');
  if (!role) redirect('/?error=' + encodeURIComponent('Prescreening is only open to people the administrator has given access.'));
  if (!allowed.includes(role)) redirect('/hr/prescreen?error=' + encodeURIComponent('You don’t have permission to do that. Ask the administrator.'));
  return { ...res, prescreenRole: role };
}
