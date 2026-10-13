-- Evergreen performance badges: one 🟢 Green / 🟡 Yellow / 🔴 Red badge per staff member per month.
-- Policy: "Staff Duties, Expectations, Performance Badges and Bonus" v1.1.
-- Staff see their own badge. Program Coordinators see their house, HR and Program Manager+ see everyone.
-- Only Program Manager+ (level 3) or HR set badges, and never their own. Safe to run more than once.
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

create policy badges_read on staff_badges for select
  using (profile_id = auth.uid() or can_see_probation(profile_id));
create policy badges_write on staff_badges for all
  using ((app_level() >= 3 or app_group() = 'hr') and profile_id <> auth.uid())
  with check ((app_level() >= 3 or app_group() = 'hr') and profile_id <> auth.uid());

-- Staff acknowledge their own badge ("I have seen this badge") without being able to change it.
create or replace function acknowledge_badge(badge uuid) returns void
language sql security definer set search_path = public as $$
  update staff_badges set acknowledged_at = now()
  where id = badge and profile_id = auth.uid() and acknowledged_at is null;
$$;
grant execute on function acknowledge_badge(uuid) to authenticated;

select 'staff_badges ready' as result, count(*) as badges from staff_badges;
