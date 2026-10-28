-- =====================================================================
-- Evergreen CRM - Home scope for levels 2 and 3 (agreed by Melvin, 28 Oct 2026).
--  * Levels 4 to 7 (Director of Operations, Executive Director, CSO, CEO) see all programs and homes (already 'all').
--  * Levels 2 (Program Coordinator) and 3 (Program Manager) see up to TWO homes: their own home plus one more,
--    or two assigned homes. Set by manager_homes. Anything beyond two needs a specific exception from an administrator.
--  * Program Coordinator sections move from 'house' (own home only) to 'assigned' (own home and assigned homes).
-- Safe to run more than once.
-- =====================================================================

update section_access set level = 'assigned' where role = 'pc' and level = 'house';

create or replace function cap_manager_homes() returns trigger language plpgsql security definer set search_path = public as $$
declare lvl int; n int;
begin
  -- Homes this person would see after this insert: own home, existing assigned homes, and the new one.
  select p.level, count(distinct h) into lvl, n from profiles p
    cross join lateral (
      select p.home_id as h
      union select m.home_id from manager_homes m where m.profile_id = p.id
      union select new.home_id
    ) s
    where p.id = new.profile_id and s.h is not null
    group by p.level;
  if coalesce(lvl, 0) in (2, 3) and coalesce(n, 0) > 2 then
    raise exception 'Program Coordinators and Program Managers can see two homes at most. Ask an administrator for an exception.';
  end if;
  return new;
end $$;

drop trigger if exists manager_homes_cap on manager_homes;
create trigger manager_homes_cap before insert on manager_homes
  for each row execute function cap_manager_homes();
