-- =====================================================================
-- Evergreen CRM - 🔒 Each house's schedule stays inside that house's program. Safe to run more than once.
-- Run after schedule-teams.sql, attendance.sql and staffing-changes.sql.
--
-- Melvin, Oct 26 2026: "Only the program house. Each house's Program Coordinator, Program Managers and directors
-- can see this. Should not be shared with the other programs — within the programs, whoever is assigned."
--  · Staff and the Program Coordinator: their own house only (as before).
--  · Program Managers: only the houses they are assigned to (their own house, plus any added under
--    👥 Staffing & lines → "Program Managers for this house"). A PM with no house sees no house schedules.
--  · Directors (level 4+) and the administrator: every house.
--  · Unchanged on purpose: a shift that still needs cover 30 minutes after a call-in is shown to staff of
--    every house (no names), so someone can pick it up; Payroll sees every shift to pay people.
--  · House alerts (call-ins, no-shows, staffing) go to the house's PC and assigned PMs; a house with no PM
--    assigned sends them to the Director of Operations instead of every PM.
-- =====================================================================

create table if not exists manager_homes (
  profile_id  uuid not null references profiles on delete cascade,
  home_id     uuid not null references homes on delete cascade,
  created_by  uuid references profiles on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  primary key (profile_id, home_id)
);
alter table manager_homes enable row level security;
drop policy if exists "manager homes see" on manager_homes;
create policy "manager homes see" on manager_homes for select using (profile_id = auth.uid() or coalesce(app_level(), 0) >= 4 or app_role() = 'admin');

-- Can I see this house's schedule?
create or replace function app_sees_home(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
         coalesce(app_role()::text, '') = 'admin'
      or (coalesce(app_level(), 0) >= 4 and app_group() is null)
      or (h is not null and app_group() is null and coalesce(app_level(), 0) >= 1 and h = app_home())
      or (h is not null and exists (select 1 from manager_homes m where m.profile_id = auth.uid() and m.home_id = h)), false);
$$;
grant execute on function app_sees_home(uuid) to authenticated;

-- Houses I may see in the schedule screens.
create or replace function schedule_homes() returns setof homes
language sql stable security definer set search_path = public as $$
  select * from homes where app_sees_home(id) order by name;
$$;
grant execute on function schedule_homes() to authenticated;

-- Who leads a house: its PC(s), the PMs assigned to it; no PM assigned → the Director of Operations.
create or replace function house_leaders(p_home uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  with pms as (
    select id from profiles where active and staff_group is null and level = 3 and home_id = p_home
    union
    select m.profile_id from manager_homes m join profiles p on p.id = m.profile_id where m.home_id = p_home and p.active and p.level = 3
  )
  select id from profiles where active and staff_group is null and level = 2 and home_id = p_home
  union
  select id from pms
  union
  select id from profiles where active and staff_group is null and level = 4 and not exists (select 1 from pms);
$$;
revoke execute on function house_leaders(uuid) from public, anon, authenticated;

-- PC of the house, an assigned PM, or a director.
create or replace function can_schedule(p_home uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_level(), 0) >= 2 and app_group() is null and app_sees_home(p_home);
$$;

-- Directors / admin: set the Program Managers for a house.
create or replace function set_house_managers(p_home uuid, p_people uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (coalesce(app_level(), 0) >= 4 and app_group() is null) and coalesce(app_role()::text, '') <> 'admin' then
    raise exception 'Only a director or the administrator can assign Program Managers to a house.';
  end if;
  delete from manager_homes where home_id = p_home and not (profile_id = any (coalesce(p_people, '{}')));
  insert into manager_homes (profile_id, home_id)
    select p.id, p_home from profiles p where p.id = any (coalesce(p_people, '{}')) and p.active and p.level = 3 and p.staff_group is null
  on conflict do nothing;
  select count(*) into n from manager_homes where home_id = p_home;
  return n;
end $$;
grant execute on function set_house_managers(uuid, uuid[]) to authenticated;

-- PMs already linked to a house keep it.
insert into manager_homes (profile_id, home_id)
  select id, home_id from profiles where active and level = 3 and staff_group is null and home_id is not null
on conflict do nothing;

-- ---------- Who can see what ----------
drop policy if exists "shifts see" on shifts;
create policy "shifts see" on shifts for select using (profile_id = auth.uid() or app_sees_home(home_id));
drop policy if exists "shifts edit" on shifts;
create policy "shifts edit" on shifts for all
  using (app_role() in ('admin', 'manager') and app_sees_home(home_id))
  with check (app_role() in ('admin', 'manager') and app_sees_home(home_id));

drop policy if exists "lines see" on schedule_lines;
create policy "lines see" on schedule_lines for select using (profile_id = auth.uid() or app_sees_home(home_id));

drop policy if exists "timeoff see" on time_off_requests;
create policy "timeoff see" on time_off_requests for select using (
  profile_id = auth.uid()
  or (coalesce(app_level(), 0) >= 2 and exists (select 1 from profiles p where p.id = time_off_requests.profile_id and app_sees_home(p.home_id))));

drop policy if exists "protected see" on protected_days;
create policy "protected see" on protected_days for select using (
  profile_id = auth.uid()
  or (coalesce(app_level(), 0) >= 2 and exists (select 1 from profiles p where p.id = protected_days.profile_id and app_sees_home(p.home_id))));

drop policy if exists "pickups see" on shift_pickups;
create policy "pickups see" on shift_pickups for select using (
  to_profile = auth.uid() or from_profile = auth.uid()
  or (coalesce(app_level(), 0) >= 2 and exists (select 1 from shifts s where s.id = shift_pickups.shift_id and app_sees_home(s.home_id))));

drop policy if exists "staffing changes see" on staffing_changes;
create policy "staffing changes see" on staffing_changes for select using (coalesce(app_level(), 0) >= 2 and app_sees_home(home_id));

-- Check
select 'schedule privacy ready' as result, (select count(*) from manager_homes) as pm_house_links;
