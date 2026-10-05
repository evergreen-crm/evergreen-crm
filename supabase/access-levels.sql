-- =====================================================================
-- Evergreen CRM - Staff access levels 1-8
-- Every person has one level (their security level). The level decides:
--   * their data scope (role):  1-2 = staff (their home), 3-7 = manager (all homes), 8 = admin
--   * which of the seven portal divisions open for them automatically
-- "Who has access" on a division still works for one-off exceptions.
-- Run once in Supabase SQL Editor (after portal.sql). Safe to run again.
-- =====================================================================

-- ---------- The eight levels ----------
create table if not exists staff_levels (
  level        int primary key check (level between 1 and 8),
  key          text not null unique,
  name         text not null,
  description  text
);
insert into staff_levels (level, key, name, description) values
  (1, 'frontline', 'Frontline',              'Youth care / support workers: shift notes, MAR, incidents, own schedule and timesheet for their home.'),
  (2, 'pc',        'Program Coordinator',    'Coordinates a home or program: reviews notes and incidents, schedules, care plans, prescreening.'),
  (3, 'pm',        'Program Manager',        'All homes: approves plans and timesheets, closes incidents, clearance decisions.'),
  (4, 'doo',       'Director of Operations', 'Admissions, organization-wide reports, licensing, executive approval.'),
  (5, 'ed',        'Executive Director',     'Payroll, billing, finance and governance.'),
  (6, 'cso',       'CSO',                    'Approves contracts and budgets.'),
  (7, 'ceo',       'CEO',                    'Security audit log and full leadership access.'),
  (8, 'admin',     'Administrator',          'Full access, including giving people access and system settings.')
on conflict (level) do update set key = excluded.key, name = excluded.name, description = excluded.description;

-- ---------- Each person's level ----------
alter table profiles add column if not exists level int references staff_levels (level);

-- Fill in levels for people who already have a role.
update profiles set level = case role
    when 'admin'   then 8
    when 'manager' then 3
    when 'staff'   then 1
  end
where level is null and role <> 'family';

-- Keep the role in step with the level, so every existing rule keeps working.
create or replace function sync_role_from_level() returns trigger
language plpgsql as $$
begin
  if new.role = 'family' then
    new.level := null;                      -- families have no staff level
  elsif new.level is not null then
    new.role := case
      when new.level >= 8 then 'admin'::user_role
      when new.level >= 3 then 'manager'::user_role
      else 'staff'::user_role
    end;
  end if;
  return new;
end $$;

drop trigger if exists profiles_sync_role on profiles;
create trigger profiles_sync_role before insert or update of level, role on profiles
  for each row execute function sync_role_from_level();

-- The signed-in person's level (0 = none / turned off / family).
create or replace function app_level() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select case when p.role = 'admin' then 8 else p.level end
                   from profiles p where p.id = auth.uid() and p.active), 0);
$$;

-- ---------- Which level opens each division ----------
-- view_level: can see the division and add records. edit_level: can also edit everyone's records.
create table if not exists division_levels (
  division    text primary key,
  view_level  int not null default 8 check (view_level between 1 and 8),
  edit_level  int not null default 8 check (edit_level between 1 and 8),
  updated_by  uuid references profiles default auth.uid(),
  updated_at  timestamptz not null default now()
);
insert into division_levels (division, view_level, edit_level) values
  ('governance', 5, 5),   -- Board / Executive Director
  ('program',    1, 3),   -- Program Manager, Coordinators, youth care workers
  ('hr',         2, 3),   -- Executive Director, Program Manager, Coordinators
  ('finance',    3, 5),   -- Executive Director, Program Manager
  ('qa',         2, 3),   -- Executive Director, Program Manager, Coordinators
  ('ohs',        3, 4),   -- Board, ED, PM, Health & Safety Coordinator, JHSC
  ('external',   3, 4)    -- Executive Director, Program Manager
on conflict (division) do nothing;

-- Division access = level OR a one-off grant on "Who has access".
create or replace function has_division(div text, need_edit boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select app_level() > 0 and (
    exists (
      select 1 from division_levels d
      where d.division = div
        and app_level() >= case when need_edit then d.edit_level else d.view_level end)
    or exists (
      select 1 from portal_access a join profiles p on p.id = a.profile_id
      where a.profile_id = auth.uid() and a.division = div and p.active
        and (not need_edit or a.can_edit)));
$$;

alter table staff_levels    enable row level security;
alter table division_levels enable row level security;

drop policy if exists "levels see" on staff_levels;
drop policy if exists "levels manage" on staff_levels;
create policy "levels see"    on staff_levels for select using (auth.uid() is not null);
create policy "levels manage" on staff_levels for all using (app_role() = 'admin') with check (app_role() = 'admin');

drop policy if exists "division levels see" on division_levels;
drop policy if exists "division levels manage" on division_levels;
create policy "division levels see"    on division_levels for select using (auth.uid() is not null);
create policy "division levels manage" on division_levels for all using (app_role() = 'admin') with check (app_role() = 'admin');

drop trigger if exists audit_division_levels on division_levels;
create trigger audit_division_levels after insert or update or delete on division_levels
  for each row execute function write_audit();

-- ---------- Clean-up: duplicate test homes and residents ----------
-- Keeps the OLDEST copy of each duplicate. A newer copy is removed ONLY if no other
-- table has any row pointing to it (notes, MAR, incidents, staff, family...).
-- Anything with data attached is kept and listed in the "Messages" output.
create or replace function _row_is_unused(tbl regclass, row_id uuid) returns boolean
language plpgsql as $$
declare c record; n bigint;
begin
  for c in
    select con.conrelid::regclass as ref_table, att.attname as ref_col
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = tbl
  loop
    execute format('select count(*) from %s where %I = $1', c.ref_table, c.ref_col) into n using row_id;
    if n > 0 then return false; end if;
  end loop;
  return true;
end $$;

do $$
declare r record;
begin
  for r in
    select id, first_name, last_name from (
      select rs.id, rs.first_name, rs.last_name, row_number() over (
        partition by lower(trim(rs.first_name)), lower(trim(rs.last_name)), lower(trim(hm.name)), rs.date_of_birth
        order by rs.created_at, rs.id) as n
      from residents rs left join homes hm on hm.id = rs.home_id) x where n > 1
  loop
    if _row_is_unused('residents', r.id) then delete from residents where id = r.id;
    else raise notice 'Kept duplicate resident % % (%): it has records', r.first_name, r.last_name, r.id; end if;
  end loop;

  for r in
    select id, name from (
      select id, name, row_number() over (partition by lower(trim(name)) order by created_at, id) as n from homes) x where n > 1
  loop
    if _row_is_unused('homes', r.id) then delete from homes where id = r.id;
    else raise notice 'Kept duplicate home % (%): it is in use', r.name, r.id; end if;
  end loop;
end $$;

drop function _row_is_unused(regclass, uuid);
