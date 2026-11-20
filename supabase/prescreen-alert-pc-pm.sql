-- Nov 20, 2026: a submitted pre-screen also alerts Program Coordinators and Program Managers (levels 2-3),
-- not only HR, the Administrator, the CEO and people given pre-screen access (Melvin's request).
create or replace function public.notify_prescreen_reviewers(pid uuid)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare p record; r record; n int := 0;
begin
  select id, first_name, last_name, application_no, position into p from prescreens where id = pid;
  if p.id is null then return 0; end if;
  for r in select id from profiles x
            where x.active and (x.role = 'admin' or x.staff_group = 'hr'
                  or (coalesce(x.level, 0) in (2, 3, 7, 8) and x.staff_group is null)
                  or exists (select 1 from prescreen_access a where a.profile_id = x.id)) loop
    perform notify(r.id, 'Pre-screen received: ' || p.first_name || coalesce(' ' || p.last_name, '') || ' (' || p.application_no || ')',
      coalesce(p.position || ' · ', '') || 'Review it and decide whether it passes before any interview is booked.',
      '/hr/prescreen/' || p.id || '?tab=application', 'prescreen-in:' || p.id || ':' || r.id);
    n := n + 1;
  end loop;
  return n;
end $function$;
revoke execute on function public.notify_prescreen_reviewers(uuid) from public, anon, authenticated;
grant execute on function public.notify_prescreen_reviewers(uuid) to service_role;
