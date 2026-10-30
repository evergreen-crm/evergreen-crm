-- Lock database functions so people who are NOT signed in can't call them (Oct 30, 2026).
-- Before: about 170 functions could be called with only the public site key, including notify() and
-- notify_managers(), which would let anyone send in-app alerts (with links) to any staff member.
--
-- Kept open (needed by pages that work without signing in, or by row-level security rules):
--   * the public-form functions: intake_open, intake_submit, prescreen_open, prescreen_submit,
--     verify_id_card (ID card QR check), evg_tz (B.C. time)
--   * the permission helpers used inside row-level security rules (app_level, app_home, can_see_..., etc.)
-- Every other function: signed-in staff keep exactly the access they had; only "not signed in" loses it.
--
-- RULE FOR NEW FUNCTIONS: Supabase opens every new function to "not signed in" by default. End each new
-- function with:  revoke execute on function <name>(<args>) from public, anon;  grant execute ... to authenticated;
-- (or "from public, anon, authenticated" for jobs only cron runs). Only public-form functions stay open.
-- Run as migration lock_anon_functions.

do $$
declare
  f record;
  keep text[] := array[
    'intake_open', 'intake_submit', 'prescreen_open', 'prescreen_submit', 'verify_id_card', 'evg_tz',
    'app_group', 'app_home', 'app_level', 'app_role', 'app_role_key', 'app_scope_home', 'app_scope_write',
    'app_sees_home', 'badge_target_level', 'can_manage_probation', 'can_manage_sign_request', 'can_see_badge',
    'can_see_probation', 'can_see_sign_request', 'can_see_survey', 'can_send_sign', 'can_set_badge',
    'has_division', 'id_photo_is_public', 'ind_manage', 'ind_write', 'is_family_of', 'prescreen_role',
    'resident_home', 'section_level'
  ];
begin
  for f in
    select p.oid, p.oid::regprocedure::text as sig,
      has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
      has_function_privilege('service_role', p.oid, 'execute') as svc_ok
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where n.nspname = 'public' and p.prokind = 'f' and d.objid is null
      and has_function_privilege('anon', p.oid, 'execute')
      and not (p.proname = any (keep))
  loop
    if f.auth_ok then execute format('grant execute on function %s to authenticated', f.sig); end if;
    if f.svc_ok then execute format('grant execute on function %s to service_role', f.sig); end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;
