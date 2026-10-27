-- =====================================================================
-- Evergreen CRM - 🔒 Menu sections + Security settings. Safe to run more than once.
-- Run after schedule-privacy.sql.
--
-- Melvin, Oct 26 2026: "update the menu into sections (HR, quality assurance, health and safety, programs,
-- individuals, houses), easier to navigate, including the security type for who can access everything".
--  · 10 sections. For each section and role the administrator picks one setting in Admin → 🔒 Security settings:
--      none (No access) · read (Read only) · own (Only their own) · house (Their house) ·
--      assigned (Houses they're assigned to) · all (Every house)
--  · The menu shows only the sections a person may open.
--  · For 👤 Individuals, 🏡 Houses and 🗓 Schedule the setting is also the database rule: it decides which
--    houses' records each person can read and change (residents, daily notes, MAR, incidents, missing youth,
--    documents, appointments, goals, messages, house posts and checklists, shifts and attendance).
--  · Families keep their own access to their family member (unchanged). ⚙️ Admin is always administrator-only.
--  · Every change is logged (section_access_log).
-- =====================================================================

-- ---------- Settings ----------
create or replace function section_defaults() returns table (section text, role text, level text)
language sql immutable as $$
  select * from (values
    ('day','fr','all'),('day','pc','all'),('day','pm','all'),('day','dir','all'),('day','hr','all'),('day','pay','all'),('day','adm','all'),
    ('ind','fr','house'),('ind','pc','house'),('ind','pm','assigned'),('ind','dir','all'),('ind','hr','none'),('ind','pay','none'),('ind','adm','all'),
    ('houses','fr','house'),('houses','pc','house'),('houses','pm','assigned'),('houses','dir','all'),('houses','hr','none'),('houses','pay','none'),('houses','adm','all'),
    ('sched','fr','house'),('sched','pc','house'),('sched','pm','assigned'),('sched','dir','all'),('sched','hr','own'),('sched','pay','own'),('sched','adm','all'),
    ('prog','fr','none'),('prog','pc','read'),('prog','pm','assigned'),('prog','dir','all'),('prog','hr','none'),('prog','pay','none'),('prog','adm','all'),
    ('hr','fr','own'),('hr','pc','house'),('hr','pm','assigned'),('hr','dir','all'),('hr','hr','all'),('hr','pay','none'),('hr','adm','all'),
    ('pay','fr','own'),('pay','pc','house'),('pay','pm','assigned'),('pay','dir','all'),('pay','hr','none'),('pay','pay','all'),('pay','adm','all'),
    ('hs','fr','read'),('hs','pc','house'),('hs','pm','assigned'),('hs','dir','all'),('hs','hr','read'),('hs','pay','read'),('hs','adm','all'),
    ('qa','fr','none'),('qa','pc','house'),('qa','pm','assigned'),('qa','dir','all'),('qa','hr','none'),('qa','pay','none'),('qa','adm','all'),
    ('adm','fr','none'),('adm','pc','none'),('adm','pm','none'),('adm','dir','none'),('adm','hr','none'),('adm','pay','none'),('adm','adm','all')
  ) v(section, role, level);
$$;

create table if not exists section_access (
  section     text not null,
  role        text not null check (role in ('fr','pc','pm','dir','hr','pay','adm')),
  level       text not null check (level in ('none','read','own','house','assigned','all')),
  updated_by  uuid references profiles on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (section, role)
);
insert into section_access (section, role, level) select * from section_defaults() on conflict do nothing;
alter table section_access enable row level security;
drop policy if exists "section access see" on section_access;
create policy "section access see" on section_access for select using (auth.uid() is not null);

create table if not exists section_access_log (
  id          uuid primary key default gen_random_uuid(),
  section     text not null,
  role        text not null,
  old_level   text,
  new_level   text not null,
  changed_by  uuid references profiles on delete set null default auth.uid(),
  changed_at  timestamptz not null default now()
);
alter table section_access_log enable row level security;
drop policy if exists "section log see" on section_access_log;
create policy "section log see" on section_access_log for select using (app_role() = 'admin');

-- ---------- Who am I, for the grid ----------
create or replace function app_role_key() returns text
language sql stable security definer set search_path = public as $$
  select case
    when p.id is null or not p.active then null
    when p.role::text = 'admin' then 'adm'
    when p.role::text = 'family' then 'family'
    when p.staff_group = 'hr' then 'hr'
    when p.staff_group = 'payroll' then 'pay'
    when coalesce(p.level, 1) >= 4 then 'dir'
    when p.level = 3 then 'pm'
    when p.level = 2 then 'pc'
    else 'fr' end
  from (select 1) x left join profiles p on p.id = auth.uid();
$$;
grant execute on function app_role_key() to authenticated;

create or replace function section_level(p_section text) returns text
language sql stable security definer set search_path = public as $$
  select case app_role_key()
    when 'adm' then 'all'
    when 'family' then 'none'
    when null then 'none'
    else coalesce((select level from section_access where section = p_section and role = app_role_key()), 'none') end;
$$;
grant execute on function section_level(text) to authenticated;

-- Can I read this house's records in this section?
create or replace function app_scope_home(p_section text, h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case section_level(p_section)
    when 'all' then true
    when 'assigned' then h is not null and (h = app_home() or exists (select 1 from manager_homes m where m.profile_id = auth.uid() and m.home_id = h))
    when 'house' then h is not null and h = app_home()
    when 'read' then h is not null and h = app_home()
    else false end, false);
$$;
grant execute on function app_scope_home(text, uuid) to authenticated;

-- Can I change this house's records in this section? (Read only can't.)
create or replace function app_scope_write(p_section text, h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select section_level(p_section) in ('house', 'assigned', 'all') and app_scope_home(p_section, h);
$$;
grant execute on function app_scope_write(text, uuid) to authenticated;

-- My row of the grid (for the menu).
create or replace function my_sections() returns table (section text, level text)
language sql stable security definer set search_path = public as $$
  select d.section, section_level(d.section) from (select distinct section from section_defaults()) d;
$$;
grant execute on function my_sections() to authenticated;

-- ---------- Administrator: change the grid ----------
create or replace function set_section_access(p_section text, p_role text, p_level text) returns text
language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if coalesce(app_role()::text, '') <> 'admin' then raise exception 'Only the administrator can change security settings.'; end if;
  if p_section in ('adm') then raise exception 'Admin is always administrator-only.'; end if;
  if p_section = 'day' and p_level = 'none' then raise exception 'Everyone needs My Day (clock in, sick calls, alerts).'; end if;
  if p_role = 'adm' then raise exception 'The administrator always has every section.'; end if;
  if p_level not in ('none','read','own','house','assigned','all') then raise exception 'Unknown setting.'; end if;
  if not exists (select 1 from section_defaults() d where d.section = p_section and d.role = p_role) then raise exception 'Unknown section or role.'; end if;
  select level into old from section_access where section = p_section and role = p_role;
  insert into section_access (section, role, level, updated_by, updated_at) values (p_section, p_role, p_level, auth.uid(), now())
  on conflict (section, role) do update set level = excluded.level, updated_by = excluded.updated_by, updated_at = now();
  if old is distinct from p_level then
    insert into section_access_log (section, role, old_level, new_level) values (p_section, p_role, old, p_level);
  end if;
  return p_level;
end $$;
grant execute on function set_section_access(text, text, text) to authenticated;

create or replace function reset_section_access() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; d record; old text;
begin
  if coalesce(app_role()::text, '') <> 'admin' then raise exception 'Only the administrator can change security settings.'; end if;
  for d in select * from section_defaults() loop
    select level into old from section_access where section = d.section and role = d.role;
    if old is distinct from d.level then
      insert into section_access (section, role, level, updated_by, updated_at) values (d.section, d.role, d.level, auth.uid(), now())
      on conflict (section, role) do update set level = excluded.level, updated_by = excluded.updated_by, updated_at = now();
      insert into section_access_log (section, role, old_level, new_level) values (d.section, d.role, old, d.level);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
grant execute on function reset_section_access() to authenticated;

-- ---------- The schedule follows the grid (replaces the fixed rule in schedule-privacy.sql) ----------
create or replace function app_sees_home(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app_scope_home('sched', h);
$$;
create or replace function can_schedule(p_home uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_level(), 0) >= 2 and app_group() is null and app_scope_write('sched', p_home);
$$;

-- ---------- 👤 Individuals ----------
-- Who may add / change: administrator and managers anywhere their setting allows; staff in their own house.
create or replace function ind_write(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (app_role() in ('admin', 'manager') or (app_role() = 'staff' and h is not null and h = app_home())) and app_scope_write('ind', h);
$$;
create or replace function ind_manage(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app_role() in ('admin', 'manager') and app_scope_write('ind', h);
$$;
grant execute on function ind_write(uuid) to authenticated;
grant execute on function ind_manage(uuid) to authenticated;

drop policy if exists "residents see" on residents;
create policy "residents see" on residents for select using (app_scope_home('ind', home_id) or is_family_of(id));
drop policy if exists "residents edit" on residents;
create policy "residents edit" on residents for all using (ind_manage(home_id) or (app_role() = 'admin')) with check (ind_manage(home_id) or app_role() = 'admin');

drop policy if exists "entries see" on entries;
create policy "entries see" on entries for select using (app_scope_home('ind', home_id) or (resident_id is not null and is_family_of(resident_id) and share_with_family));
drop policy if exists "entries add" on entries;
create policy "entries add" on entries for insert with check (created_by = auth.uid() and ind_write(home_id));
drop policy if exists "entries edit" on entries;
create policy "entries edit" on entries for update using (ind_manage(home_id)) with check (ind_manage(home_id));

drop policy if exists "incidents see" on incidents;
create policy "incidents see" on incidents for select using (app_scope_home('ind', home_id));
drop policy if exists "incidents add" on incidents;
create policy "incidents add" on incidents for insert with check (ind_write(home_id));
drop policy if exists "incidents edit" on incidents;
create policy "incidents edit" on incidents for update using (ind_write(home_id)) with check (ind_write(home_id));
drop policy if exists "incidents delete" on incidents;
create policy "incidents delete" on incidents for delete using (ind_manage(home_id));

drop policy if exists "notes see" on shift_notes;
create policy "notes see" on shift_notes for select using (app_scope_home('ind', resident_home(resident_id)) or (is_family_of(resident_id) and share_with_family and signed_at is not null));
drop policy if exists "notes add" on shift_notes;
create policy "notes add" on shift_notes for insert with check (author_id = auth.uid() and ind_write(resident_home(resident_id)));

drop policy if exists "meds see" on medications;
create policy "meds see" on medications for select using (app_scope_home('ind', resident_home(resident_id)));
drop policy if exists "meds edit" on medications;
create policy "meds edit" on medications for all using (ind_manage(resident_home(resident_id))) with check (ind_manage(resident_home(resident_id)));

drop policy if exists "mar see" on med_administrations;
create policy "mar see" on med_administrations for select using (app_scope_home('ind', resident_home(resident_id)));
drop policy if exists "mar add" on med_administrations;
create policy "mar add" on med_administrations for insert with check (given_by = auth.uid() and ind_write(resident_home(resident_id)));
drop policy if exists "mar fix" on med_administrations;
create policy "mar fix" on med_administrations for update using (ind_manage(resident_home(resident_id))) with check (ind_manage(resident_home(resident_id)));

drop policy if exists "goals see" on goals;
create policy "goals see" on goals for select using (app_scope_home('ind', resident_home(resident_id)) or is_family_of(resident_id));
drop policy if exists "goals edit" on goals;
create policy "goals edit" on goals for all using (ind_manage(resident_home(resident_id))) with check (ind_manage(resident_home(resident_id)));

drop policy if exists "appointments see" on appointments;
create policy "appointments see" on appointments for select using (app_scope_home('ind', home_id) or (resident_id is not null and is_family_of(resident_id) and share_with_family));
drop policy if exists "appointments add" on appointments;
create policy "appointments add" on appointments for insert with check (ind_write(home_id));
drop policy if exists "appointments edit" on appointments;
create policy "appointments edit" on appointments for update using (ind_write(home_id)) with check (ind_write(home_id));
drop policy if exists "appointments delete" on appointments;
create policy "appointments delete" on appointments for delete using (ind_manage(home_id));

drop policy if exists "documents see" on documents;
create policy "documents see" on documents for select using (app_scope_home('ind', home_id));
drop policy if exists "documents add" on documents;
create policy "documents add" on documents for insert with check (ind_write(home_id));
drop policy if exists "documents delete" on documents;
create policy "documents delete" on documents for delete using (ind_manage(home_id));

drop policy if exists "messages see" on messages;
create policy "messages see" on messages for select using (app_scope_home('ind', resident_home(resident_id)) or is_family_of(resident_id));
drop policy if exists "messages send" on messages;
create policy "messages send" on messages for insert with check (sender_id = auth.uid() and (ind_write(resident_home(resident_id)) or is_family_of(resident_id)));
drop policy if exists "messages mark read" on messages;
create policy "messages mark read" on messages for update using (app_scope_home('ind', resident_home(resident_id)) or is_family_of(resident_id)) with check (true);

drop policy if exists "missing see" on missing_episodes;
create policy "missing see" on missing_episodes for select using (app_scope_home('ind', home_id));
drop policy if exists "missing log see" on missing_log;
create policy "missing log see" on missing_log for select using (exists (select 1 from missing_episodes e where e.id = missing_log.episode_id and app_scope_home('ind', e.home_id)));

drop policy if exists "requirements see" on resident_requirements;
create policy "requirements see" on resident_requirements for select using (app_scope_home('ind', resident_home(resident_id)));
drop policy if exists "requirements write" on resident_requirements;
create policy "requirements write" on resident_requirements for all using (ind_write(resident_home(resident_id))) with check (ind_write(resident_home(resident_id)));

-- ---------- 🏡 Houses ----------
drop policy if exists "homes see" on homes;
create policy "homes see" on homes for select using (
  app_role() = 'admin' or id = app_home() or app_scope_home('houses', id) or app_scope_home('ind', id) or app_scope_home('sched', id));
drop policy if exists "homes manager edit" on homes;
create policy "homes manager edit" on homes for update using (app_role() = 'manager' and app_scope_write('houses', id)) with check (app_role() = 'manager' and app_scope_write('houses', id));

drop policy if exists "posts see" on house_posts;
create policy "posts see" on house_posts for select using (coalesce(app_level(), 0) >= 1 and (home_id is null or app_scope_home('houses', home_id)));
drop policy if exists "posts add" on house_posts;
create policy "posts add" on house_posts for insert with check (created_by = auth.uid() and (
  (coalesce(app_level(), 0) >= 3 and (home_id is null or app_scope_write('houses', home_id)))
  or (coalesce(app_level(), 0) = 2 and home_id is not null and home_id = app_home() and app_scope_write('houses', home_id))));
drop policy if exists "posts edit" on house_posts;
create policy "posts edit" on house_posts for update
  using ((coalesce(app_level(), 0) >= 3 and (home_id is null or app_scope_write('houses', home_id))) or created_by = auth.uid())
  with check ((coalesce(app_level(), 0) >= 3 and (home_id is null or app_scope_write('houses', home_id))) or (created_by = auth.uid() and home_id is not null and home_id = app_home()));
drop policy if exists "posts delete" on house_posts;
create policy "posts delete" on house_posts for delete using ((coalesce(app_level(), 0) >= 3 and (home_id is null or app_scope_write('houses', home_id))) or created_by = auth.uid());

drop policy if exists "hci_read" on house_checklist_items;
create policy "hci_read" on house_checklist_items for select using (app_scope_home('houses', home_id));
drop policy if exists "hci_write" on house_checklist_items;
create policy "hci_write" on house_checklist_items for all using (coalesce(app_level(), 0) >= 2 and app_scope_write('houses', home_id)) with check (coalesce(app_level(), 0) >= 2 and app_scope_write('houses', home_id));

drop policy if exists "scl_read" on shift_checklists;
create policy "scl_read" on shift_checklists for select using (profile_id = auth.uid() or (coalesce(app_level(), 0) >= 2 and app_scope_home('houses', home_id)));

drop policy if exists "ea_read" on emergency_alerts;
create policy "ea_read" on emergency_alerts for select using (profile_id = auth.uid() or (coalesce(app_level(), 0) >= 2 and app_scope_home('houses', home_id)));

-- ---------- 🗓 Schedule & Time: attendance follows the schedule setting ----------
drop policy if exists "absences_read" on shift_absences;
create policy "absences_read" on shift_absences for select using (
  profile_id = auth.uid()
  or (app_group() is null and coalesce(app_level(), 0) >= 2 and app_scope_home('sched', home_id))
  or coalesce(app_group(), '') = 'payroll');
drop policy if exists "time see" on time_entries;
create policy "time see" on time_entries for select using (profile_id = auth.uid() or (app_role() in ('admin', 'manager') and app_scope_home('sched', home_id)));

-- Check
select 'section access ready' as result, (select count(*) from section_access) as settings;
