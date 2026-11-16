-- Melvin, Nov 15 2026: the whole management team can see pre-screening files. Applied as migration
-- prescreen_management_access. Directors (level 4+): full access ('hr'). Program Coordinators and Program
-- Managers: 'interviewer' (see files, interviews and reference checks; clearance decisions stay with HR,
-- directors and the Administrator). An access row set by the Administrator still wins below director level.
create or replace function public.prescreen_role()
returns text language sql stable security definer set search_path to 'public' as $function$
  select case
    when app_role() = 'admin' then 'admin'
    when app_role() is null then null
    when app_group() = 'hr' then 'hr'
    when coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '' then 'hr'
    else coalesce((select access from prescreen_access where profile_id = auth.uid()),
                  case when coalesce(app_level(), 0) in (2, 3) and coalesce(app_group(), '') = '' then 'interviewer' end)
  end
$function$;
revoke execute on function public.prescreen_role() from public, anon;
grant execute on function public.prescreen_role() to authenticated, service_role;
