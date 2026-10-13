-- Evergreen performance badges: one 🟢 Green / 🟡 Yellow / 🔴 Red badge per staff member per month.
-- Policy: "Staff Duties, Expectations, Performance Badges and Bonus" v1.1.
-- Everyone has a badge, from Frontline to Administrator. Nobody sets their own. Safe to run more than once.
-- Uses app_level(), app_group() and can_see_probation() from access-levels.sql / launch-people.sql.

create table if not exists staff_badges (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  month       date not null check (extract(day from month) = 1),
  color       text not null check (color in ('green', 'yellow', 'red')),
  reasons     text[] not null default '{}',
  restart     boolean not null default false,   -- restarts the 24-month bonus count
  note        text,
  set_by      uuid references profiles(id),
  set_at      timestamptz not null default now(),
  acknowledged_at timestamptz,
  unique (profile_id, month)
);
create index if not exists staff_badges_profile on staff_badges (profile_id, month desc);

alter table staff_badges enable row level security;
drop policy if exists badges_read on staff_badges;
drop policy if exists badges_write on staff_badges;
drop policy if exists badges_ack on staff_badges;

-- Everyone gets a badge, executives and administrators included. Nobody sets their own.
-- Frontline to Program Manager: set by a higher level (Program Manager+), or HR for levels 1-2.
-- Director of Operations and above (level 4+): set and seen only by Executive Director, CSO, CEO or Administrator (level 5+).
create or replace function badge_target_level(target uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select case when p.role = 'admin' then 8 else coalesce(p.level, 1) end from profiles p where p.id = target), 1);
$$;
create or replace function can_set_badge(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target <> auth.uid() and (
       app_level() >= 5
    or (app_level() >= 3 and app_level() > badge_target_level(target))
    or (app_group() = 'hr' and badge_target_level(target) < 3));
$$;
create or replace function can_see_badge(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target = auth.uid()
      or can_set_badge(target)
      or (can_see_probation(target) and (badge_target_level(target) < 4 or app_level() >= 5));
$$;
grant execute on function badge_target_level(uuid) to authenticated;
grant execute on function can_set_badge(uuid) to authenticated;
grant execute on function can_see_badge(uuid) to authenticated;

create policy badges_read on staff_badges for select using (can_see_badge(profile_id));
create policy badges_write on staff_badges for all using (can_set_badge(profile_id)) with check (can_set_badge(profile_id));

-- Staff acknowledge their own badge ("I have seen this badge") without being able to change it.
create or replace function acknowledge_badge(badge uuid) returns void
language sql security definer set search_path = public as $$
  update staff_badges set acknowledged_at = now()
  where id = badge and profile_id = auth.uid() and acknowledged_at is null;
$$;
grant execute on function acknowledge_badge(uuid) to authenticated;

select 'staff_badges ready' as result, count(*) as badges from staff_badges;
