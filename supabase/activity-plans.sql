-- =====================================================================
-- Evergreen CRM - House activity plan (the daily program / schedule of services, per house).
--  * One row per planned activity: weekday (or every day), time, what it is, who it's for (a few
--    residents, or the whole house), and which shift runs it.
--  * Everyone in the house can read it. Program Coordinators, Program Managers and admins edit it.
-- Uses app_level(), app_home(), app_role(). Safe to run more than once.
-- =====================================================================

create table if not exists activity_plans (
  id           uuid primary key default gen_random_uuid(),
  home_id      uuid not null references homes on delete cascade,
  weekday      smallint check (weekday between 0 and 6),   -- 0 = Monday … 6 = Sunday; null = every day
  time_from    time,
  time_to      time,
  shift        text check (shift in ('Day', 'Evening', 'Awake night', 'Sleep night', 'Any')),
  activity     text not null,
  resident_ids uuid[] not null default '{}',               -- empty = the whole house
  notes        text,
  active       boolean not null default true,
  created_by   uuid references profiles default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists activity_plans_home on activity_plans (home_id, active);
alter table activity_plans enable row level security;

drop policy if exists ap_read on activity_plans;
create policy ap_read on activity_plans for select
  using (app_level() >= 3 or app_home() = home_id);

drop policy if exists ap_write on activity_plans;
create policy ap_write on activity_plans for all
  using (app_role() = 'admin' or app_level() >= 3 or (app_level() = 2 and app_home() = home_id))
  with check (app_role() = 'admin' or app_level() >= 3 or (app_level() = 2 and app_home() = home_id));
