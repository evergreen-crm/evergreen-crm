-- =====================================================================
-- Evergreen CRM - Missing details: hire date, program and everything else a staff or house record needs.
--  * Every morning (and when a leader opens the portal) the CRM checks every active staff member and house.
--  * Anything missing becomes a "missing detail" with a due date 1 week away, and the Program Coordinator of
--    that house and the Program Manager(s) get a notification (HR too, for staff records).
--  * Not done within 1 week  -> it goes up to the Director of Operations (level 4).
--  * Still not done after 1 month -> it goes up to the Executive Director, CSO and CEO (levels 5-7) and Admins.
--  * Every Monday, whoever is responsible gets a reminder while things are still missing.
--  * As soon as the detail is filled in, it closes by itself and counts as fixed (so you can see how it's going).
--  * Program Coordinators can fill in blanks for staff in their own house (they can't overwrite anything).
-- Needs: app_level(), app_home(), app_group(), notify(), house_leaders() (shift-checklists.sql).
-- Safe to run more than once.
-- =====================================================================

-- 1. Program: "Both" is the default, so we need to know whether someone actually chose it.
alter table staff_details add column if not exists program_confirmed boolean not null default false;
update staff_details sd set program_confirmed = true
 where not sd.program_confirmed
   and (sd.program <> 'Both'
        or exists (select 1 from onboardings o where o.profile_id = sd.profile_id));

-- 2. The missing details and the run log.
create table if not exists record_gaps (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('staff','house')),
  subject_id   uuid not null,                 -- profiles.id or homes.id
  subject_name text,
  home_id      uuid references homes on delete set null,
  field        text not null,
  label        text not null,
  fix_link     text,
  found_at     timestamptz not null default now(),
  due_on       date not null,
  stage        int not null default 1 check (stage between 1 and 3),  -- 1 PC/PM · 2 Director of Operations · 3 ED, CSO, CEO
  stage_at     timestamptz not null default now(),
  fixed_at     timestamptz
);
create unique index if not exists record_gaps_open on record_gaps (kind, subject_id, field) where fixed_at is null;
create index if not exists record_gaps_home on record_gaps (home_id) where fixed_at is null;
create index if not exists record_gaps_fixed on record_gaps (fixed_at desc) where fixed_at is not null;

create table if not exists record_gap_runs (
  id        bigserial primary key,
  ran_at    timestamptz not null default now(),
  trigger   text,
  found     int not null default 0,
  fixed     int not null default 0,
  escalated int not null default 0,
  open_now  int not null default 0
);

alter table record_gaps enable row level security;
alter table record_gap_runs enable row level security;
drop policy if exists "record gaps see" on record_gaps;
create policy "record gaps see" on record_gaps for select using (
  app_level() >= 3
  or coalesce(app_group(), '') = 'hr'
  or (app_level() = 2 and home_id is not null and home_id = app_home())
  or (kind = 'staff' and subject_id = auth.uid())
);
drop policy if exists "record gap runs see" on record_gap_runs;
create policy "record gap runs see" on record_gap_runs for select using (app_level() >= 2 or coalesce(app_group(), '') = 'hr');

-- 3. What is missing right now (one row per missing detail).
create or replace function current_record_gaps()
returns table (kind text, subject_id uuid, subject_name text, home_id uuid, field text, label text, fix_link text)
language sql stable security definer set search_path = public as $$
  with s as (
    select p.id, p.full_name, p.home_id, p.phone, p.level, p.staff_group, p.role,
           d.profile_id as has_row, d.hire_date, d.program_confirmed, d.position, d.employment_type,
           d.emergency_contact, d.emergency_phone
      from profiles p
      left join staff_details d on d.profile_id = p.id
     where p.active and p.role in ('staff','manager')
       and coalesce(d.employment_status, 'Active') = 'Active'
  ),
  checks as (
    select s.*, c.field, c.label, c.missing, c.link from s
    cross join lateral (values
      ('hire_date',  'Hire date',                                   s.hire_date is null,                                   '/records?fill=' || s.id),
      ('program',    'Program (MCFD, CLBC or both)',                 not coalesce(s.program_confirmed, false),               '/records?fill=' || s.id),
      ('position',   'Position',                                    coalesce(trim(s.position), '') = '',                    '/records?fill=' || s.id),
      ('employment', 'Full-time, part-time or casual',              s.employment_type is null,                              '/records?fill=' || s.id),
      ('emergency',  'Emergency contact and phone',                 coalesce(trim(s.emergency_contact), '') = '' or coalesce(trim(s.emergency_phone), '') = '', '/records?fill=' || s.id),
      ('phone',      'Phone number',                                coalesce(trim(s.phone), '') = '',                       '/records?fill=' || s.id),
      ('house',      'House (where they work)',                     s.home_id is null and coalesce(s.level, 1) <= 2 and s.staff_group is null, '/admin'),
      ('crc',        'Criminal record check (missing or expired)',
         not exists (select 1 from certifications c where c.profile_id = s.id and c.cert_type ilike '%criminal%'
                       and (c.expires_on is null or c.expires_on >= current_date)),                                          '/hr/' || s.id),
      ('first_aid',  'First Aid & CPR (missing or expired)',
         coalesce(s.level, 1) <= 3 and s.staff_group is null
         and not exists (select 1 from certifications c where c.profile_id = s.id and c.cert_type ilike '%first aid%'
                       and (c.expires_on is null or c.expires_on >= current_date)),                                          '/hr/' || s.id)
    ) as c(field, label, missing, link)
  )
  select 'staff', id, full_name, home_id, field, label, link from checks where missing
  union all
  select 'house', h.id, h.name, h.id, c.field, c.label, '/homes/' || h.id || '?edit=1'
    from homes h
    cross join lateral (values
      ('location', 'House location (map pin for clock in and out)', h.lat is null or h.lng is null),
      ('on_call',  'On-call phone (for the 🆘 button)',               coalesce(trim(h.on_call_phone), '') = ''),
      ('phone',    'House phone',                                   coalesce(trim(h.phone), '') = ''),
      ('address',  'Street address',                                coalesce(trim(h.address), '') = '')
    ) as c(field, label, missing)
   where c.missing;
$$;
revoke execute on function current_record_gaps() from public, anon, authenticated;

-- Who is responsible at each stage.
create or replace function gap_owners(p_kind text, p_home uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select x from house_leaders(p_home) x where p_home is not null
  union
  select id from profiles where p_home is null and active and staff_group is null and level = 3
  union
  select id from profiles where p_kind = 'staff' and active and role = 'staff' and staff_group = 'hr';
$$;
create or replace function gap_up_people(p_stage int) returns setof uuid
language sql stable security definer set search_path = public as $$
  -- stage 2: Director of Operations (if there isn't one: the Executive Director and above)
  select id from profiles where p_stage = 2 and active and staff_group is null and level = 4
  union
  select id from profiles where p_stage = 2 and active and staff_group is null and level between 5 and 7
    and not exists (select 1 from profiles x where x.active and x.staff_group is null and x.level = 4)
  union
  -- stage 3: Executive Director, CSO, CEO and Administrators
  select id from profiles where p_stage = 3 and active and ((staff_group is null and level between 5 and 7) or role = 'admin');
$$;
revoke execute on function gap_owners(text, uuid) from public, anon, authenticated;
revoke execute on function gap_up_people(int) from public, anon, authenticated;

-- A short list for the notification text: "Jane Doe: Hire date · Oak House: On-call phone …"
create or replace function gap_list(ids uuid[]) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select string_agg(t, ' · ') from (
           select coalesce(subject_name, '?') || ': ' || label as t from record_gaps where id = any(ids) order by subject_name, label limit 4) z), '')
         || case when cardinality(ids) > 4 then ' …' else '' end;
$$;
revoke execute on function gap_list(uuid[]) from public, anon, authenticated;

-- 4. The check itself. p_trigger: 'cron' (every morning), 'auto' (a leader opened the portal; at most every
--    6 hours), 'now' (the "Check now" button). Returns a short summary.
create or replace function scan_record_gaps(p_trigger text default 'auto') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  last record_gap_runs; new_ids uuid[]; up2 uuid[]; up3 uuid[]; n_fixed int; n_open int;
  r record; today date := (now() at time zone 'America/Vancouver')::date;
  wk text := to_char((now() at time zone 'America/Vancouver')::date, 'IYYY-IW');
  monday boolean := extract(isodow from (now() at time zone 'America/Vancouver')) = 1;
begin
  if auth.uid() is not null and not (app_level() >= 2 or coalesce(app_group(), '') = 'hr') then
    raise exception 'Only Program Coordinators and above can run the missing-details check.';
  end if;
  select * into last from record_gap_runs order by ran_at desc limit 1;
  if p_trigger = 'auto' and last.id is not null and last.ran_at > now() - interval '6 hours' then
    return jsonb_build_object('skipped', true, 'ran_at', last.ran_at, 'open', last.open_now);
  end if;

  -- new
  with cur as (select * from current_record_gaps()),
  ins as (
    insert into record_gaps (kind, subject_id, subject_name, home_id, field, label, fix_link, due_on)
    select c.kind, c.subject_id, c.subject_name, c.home_id, c.field, c.label, c.fix_link, today + 7
      from cur c
     where not exists (select 1 from record_gaps g where g.fixed_at is null and g.kind = c.kind and g.subject_id = c.subject_id and g.field = c.field)
    returning id)
  select array_agg(id) into new_ids from ins;

  -- fixed
  with cur as (select * from current_record_gaps())
  update record_gaps g set fixed_at = now()
   where g.fixed_at is null
     and not exists (select 1 from cur c where c.kind = g.kind and c.subject_id = g.subject_id and c.field = g.field);
  get diagnostics n_fixed = row_count;

  -- keep names and houses current (someone may have moved house)
  with cur as (select * from current_record_gaps())
  update record_gaps g set subject_name = c.subject_name, home_id = c.home_id, fix_link = c.fix_link
    from cur c
   where g.fixed_at is null and c.kind = g.kind and c.subject_id = g.subject_id and c.field = g.field
     and (g.subject_name is distinct from c.subject_name or g.home_id is distinct from c.home_id or g.fix_link is distinct from c.fix_link);

  -- move up: 1 week -> Director of Operations, 1 month -> ED, CSO, CEO
  with u as (
    update record_gaps set stage = 3, stage_at = now()
     where fixed_at is null and stage < 3 and found_at <= now() - interval '30 days' returning id)
  select array_agg(id) into up3 from u;
  with u as (
    update record_gaps set stage = 2, stage_at = now()
     where fixed_at is null and stage < 2 and found_at <= now() - interval '7 days' returning id)
  select array_agg(id) into up2 from u;

  -- notifications: new ones -> Program Coordinator + Program Manager (+ HR for staff records)
  if new_ids is not null then
    for r in select o as pid, array_agg(g.id) ids, min(g.due_on) due
               from record_gaps g cross join lateral gap_owners(g.kind, g.home_id) o
              where g.id = any(new_ids) group by o loop
      perform notify(r.pid, 'Missing details: ' || cardinality(r.ids) || ' to fill in',
        'Please complete by ' || to_char(r.due, 'Mon DD') || ' (1 week). If not done it goes to the Director of Operations. ' || gap_list(r.ids),
        '/records', 'gaps1:' || r.pid || ':' || today);
    end loop;
  end if;

  -- 1 week overdue -> the people responsible + Director of Operations
  if up2 is not null then
    for r in select pid, array_agg(id) ids from (
               select g.id, o as pid from record_gaps g cross join lateral gap_owners(g.kind, g.home_id) o where g.id = any(up2)
               union
               select g.id, u from record_gaps g cross join gap_up_people(2) u where g.id = any(up2)) z
             group by pid loop
      perform notify(r.pid, 'Overdue: ' || cardinality(r.ids) || ' missing detail' || case when cardinality(r.ids) = 1 then '' else 's' end || ' not done within 1 week',
        'Now reported to the Director of Operations. After 1 month it goes to the Executive Director and CEO. ' || gap_list(r.ids),
        '/records?stage=2', 'gaps2:' || r.pid || ':' || today);
    end loop;
  end if;

  -- 1 month -> also Executive Director, CSO, CEO and Admins
  if up3 is not null then
    for r in select pid, array_agg(id) ids from (
               select g.id, o as pid from record_gaps g cross join lateral gap_owners(g.kind, g.home_id) o where g.id = any(up3)
               union
               select g.id, u from record_gaps g cross join gap_up_people(2) u where g.id = any(up3)
               union
               select g.id, u from record_gaps g cross join gap_up_people(3) u where g.id = any(up3)) z
             group by pid loop
      perform notify(r.pid, 'Still missing after 1 month: ' || cardinality(r.ids) || ' detail' || case when cardinality(r.ids) = 1 then '' else 's' end,
        'Reported to the Executive Director, CSO and CEO. ' || gap_list(r.ids),
        '/records?stage=3', 'gaps3:' || r.pid || ':' || today);
    end loop;
  end if;

  -- Mondays: reminder to everyone responsible while anything is still open (not on the day it was found)
  if monday then
    for r in select pid, array_agg(id) ids, bool_or(late) late from (
               select g.id, o as pid, g.due_on < today as late from record_gaps g cross join lateral gap_owners(g.kind, g.home_id) o
                where g.fixed_at is null and g.found_at < now() - interval '1 day'
               union
               select g.id, u, true from record_gaps g cross join gap_up_people(2) u where g.fixed_at is null and g.stage >= 2
               union
               select g.id, u, true from record_gaps g cross join gap_up_people(3) u where g.fixed_at is null and g.stage = 3) z
             group by pid loop
      perform notify(r.pid, 'Weekly reminder: ' || cardinality(r.ids) || ' missing detail' || case when cardinality(r.ids) = 1 then '' else 's' end || case when r.late then ' (some overdue)' else '' end,
        gap_list(r.ids), '/records', 'gapsw:' || r.pid || ':' || wk);
    end loop;
  end if;

  select count(*) into n_open from record_gaps where fixed_at is null;
  insert into record_gap_runs (trigger, found, fixed, escalated, open_now)
  values (p_trigger, coalesce(cardinality(new_ids), 0), n_fixed, coalesce(cardinality(up2), 0) + coalesce(cardinality(up3), 0), n_open);
  delete from record_gap_runs where ran_at < now() - interval '180 days';

  return jsonb_build_object('found', coalesce(cardinality(new_ids), 0), 'fixed', n_fixed,
    'escalated', coalesce(cardinality(up2), 0) + coalesce(cardinality(up3), 0), 'open', n_open);
end $$;
revoke execute on function scan_record_gaps(text) from public, anon;
grant execute on function scan_record_gaps(text) to authenticated;

-- 5. Fill in blanks for one staff member. Program Coordinators: staff in their own house only.
--    Only empty details are filled — nothing that's already there gets changed (use the HR page for that).
create or replace function fill_staff_blanks(p_profile uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare them profiles; v_prog text := nullif(p->>'program', ''); v_type text := nullif(p->>'employment_type', '');
        v_hire date;
begin
  select * into them from profiles where id = p_profile;
  if them.id is null then raise exception 'Staff member not found.'; end if;
  if not (app_level() >= 3 or coalesce(app_group(), '') = 'hr'
          or (app_level() = 2 and them.home_id is not null and them.home_id = app_home())) then
    raise exception 'Program Coordinators can fill in details for staff in their own house only.';
  end if;
  if v_prog is not null and v_prog not in ('MCFD','CLBC','Both') then raise exception 'Choose MCFD, CLBC or Both.'; end if;
  if v_type is not null and v_type not in ('Full-time','Part-time','Casual') then raise exception 'Choose full-time, part-time or casual.'; end if;
  begin v_hire := nullif(p->>'hire_date', '')::date;
  exception when others then raise exception 'The hire date is not a valid date.'; end;
  if v_hire is not null and v_hire > current_date + 90 then raise exception 'The hire date is too far in the future.'; end if;

  insert into staff_details (profile_id) values (p_profile) on conflict (profile_id) do nothing;
  update staff_details set
    hire_date         = coalesce(hire_date, v_hire),
    position          = coalesce(nullif(trim(position), ''), nullif(trim(p->>'position'), '')),
    employment_type   = coalesce(employment_type, v_type),
    emergency_contact = coalesce(nullif(trim(emergency_contact), ''), nullif(trim(p->>'emergency_contact'), '')),
    emergency_phone   = coalesce(nullif(trim(emergency_phone), ''), nullif(trim(p->>'emergency_phone'), '')),
    program           = case when not program_confirmed and v_prog is not null then v_prog else program end,
    program_confirmed = program_confirmed or v_prog is not null,
    updated_at        = now()
  where profile_id = p_profile;
  if nullif(trim(p->>'phone'), '') is not null then
    update profiles set phone = trim(p->>'phone') where id = p_profile and coalesce(trim(phone), '') = '';
  end if;
  return scan_record_gaps('now');
end $$;
revoke execute on function fill_staff_blanks(uuid, jsonb) from public, anon;
grant execute on function fill_staff_blanks(uuid, jsonb) to authenticated;

-- 6. Every morning at 8:20 am Vancouver time (15:20 UTC; 7:20 am in winter).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('evergreen-record-gaps') where exists (select 1 from cron.job where jobname = 'evergreen-record-gaps');
  perform cron.schedule('evergreen-record-gaps', '20 15 * * *', $c$select public.scan_record_gaps('cron')$c$);
exception when others then
  raise notice 'Scheduler not available here (%). The check still runs when leaders open the portal.', sqlerrm;
end $$;

-- 7. First check now (this sends the first notifications), then a summary.
select scan_record_gaps('cron');
select 'missing details ready' as result,
       (select count(*) from record_gaps where fixed_at is null) as missing_now,
       (select count(distinct subject_id) from record_gaps where fixed_at is null and kind = 'staff') as staff_with_gaps,
       (select count(*) from record_gaps where fixed_at is null and field = 'hire_date') as no_hire_date,
       (select count(*) from record_gaps where fixed_at is null and kind = 'house') as house_gaps;
