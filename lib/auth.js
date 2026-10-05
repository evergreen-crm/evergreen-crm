// Who is logged in, and what is their role?
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };

  let { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role, level, home_id, active')
    .eq('id', user.id)
    .maybeSingle();

  // Before supabase/access-levels.sql is run there is no `level` column yet.
  if (profileError) {
    ({ data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, role, home_id, active')
      .eq('id', user.id)
      .maybeSingle());
  }

  return { supabase, user, profile };
}

// Use at the top of a page: sends people to /login if not allowed.
export async function requireUser(allowedRoles) {
  const result = await getCurrentUser();
  if (!result.user) redirect('/login');
  if (!result.profile || !result.profile.active) redirect('/login?error=inactive');
  if (allowedRoles && !allowedRoles.includes(result.profile.role)) redirect('/');
  return result;
}
