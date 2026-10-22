-- 🪪 Expiry tracking and "cleared to work" (item 6).
-- Evergreen Staff Rules Handbook §2–3: no contact with youth or adults without a clear criminal record check (renewed
-- every 5 years); First Aid before the first solo shift; NVCI by day 90; "an expired CRC or required training removes
-- you from the schedule until renewed"; renewals booked 30 days before expiry.
--   · cleared_on(staff, day): why someone can't work that day (or null = cleared).
--   · Shifts: someone who isn't cleared can't be given or pick up a shift in the next 7 days (or any shift if a
--     criminal record check is missing). Pattern shifts are left open instead.
--   · Every morning: reminders at 30, 7 and 0 days (staff + Program Coordinator/Manager), and shifts in the next
--     7 days for anyone not cleared become open shifts.
-- Safe to run more than once.

-- Which kind of certificate is this? (cert_type is free text)
create or replace function cert_kind(t text) returns text language sql immutable as $$
  select case
    when t ilike '%criminal%' then 'crc'
    when t ilike '%first aid%' then 'first_aid'
    when t ilike '%nvci%' or t ilike '%crisis intervention%' then 'nvci'
    when t ilike '%driver%' or t ilike '%abstract%' then 'driver'
    when t ilike '%medication%' then 'meds'
    else 'other' end;
$$;

create or replace function cert_label(k text) returns text language sql immutable as $$
  select case k when 'crc' then 'criminal record check' when 'first_aid' then 'First Aid & CPR'
    when 'nvci' then 'NVCI' when 'driver' then 'driver’s licence / abstract' when 'meds' then 'Medication Administration'
    else 'certificate' end;
$$;

-- Good until (latest across all certificates of that kind). A criminal record check without an expiry date counts
-- for 5 years from its issue date. Null = none on file.
create or replace function cert_until(p_profile uuid, p_kind text) returns date language sql stable security definer set search_path = public as $$
  select max(case
      when c.expires_on is not null then c.expires_on
      when p_kind = 'crc' and c.issued_on is not null then (c.issued_on + interval '5 years')::date
      else 'infinity'::date end)
    from certifications c where c.profile_id = p_profile and cert_kind(c.cert_type) = p_kind;
$$;

-- Why this person can't work with youth/adults on this day. Null = cleared.
-- Only frontline, Program Coordinators and Program Managers (levels 1–3) who work in the houses are checked.
create or replace function cleared_on(p_profile uuid, p_day date default current_date) returns text
language plpgsql stable security definer set search_path = public as $$
declare p profiles; hired date; u date;
begin
  select * into p from profiles where id = p_profile;
  if p.id is null or p.staff_group is not null or coalesce(p.level, 1) > 3 or p.role = 'admin' then return null; end if;
  select hire_date into hired from staff_details where profile_id = p_profile;
  u := cert_until(p_profile, 'crc');
  if u is null then return 'No criminal record check on file. No contact with youth or adults until it is cleared.'; end if;
  if u < p_day then return 'Criminal record check expired on ' || to_char(u, 'Mon DD, YYYY') || '.'; end if;
  u := cert_until(p_profile, 'first_aid');
  if u is null and hired is not null and p_day > hired + 7 then return 'No First Aid & CPR certificate on file (needed before solo shifts).'; end if;
  if u is not null and u < p_day then return 'First Aid & CPR expired on ' || to_char(u, 'Mon DD, YYYY') || '.'; end if;
  u := cert_until(p_profile, 'nvci');
  if u is null and hired is not null and p_day > hired + 90 then return 'No NVCI certificate on file (needed by day 90).'; end if;
  if u is not null and u < p_day then return 'NVCI expired on ' || to_char(u, 'Mon DD, YYYY') || '.'; end if;
  return null;
end $$;
grant execute on function cleared_on(uuid, date) to authenticated;

-- My own status (for the ID card).
create or replace function my_clearance() returns text language sql stable security definer set search_path = public as $$
  select cleared_on(auth.uid(), current_date);
$$;
grant execute on function my_clearance() to authenticated;

-- Shifts: block giving or picking up a shift for someone who isn't cleared.
create or replace function shifts_cleared_check() returns trigger language plpgsql security definer set search_path = public as $$
declare why text; nm text;
begin
  if new.profile_id is null or new.shift_date < current_date then return new; end if;
  if tg_op = 'UPDATE' and new.profile_id is not distinct from old.profile_id then return new; end if;
  why := cleared_on(new.profile_id, new.shift_date);
  if why is null then return new; end if;
  -- Far-future shifts are allowed (there's time to renew) unless something is missing altogether.
  if new.shift_date > current_date + 7 and why not like 'No %' then return new; end if;
  if coalesce(new.source, 'manual') = 'pattern' then
    new.profile_id := null; new.open_reason := why; return new;
  end if;
  select full_name into nm from profiles where id = new.profile_id;
  raise exception '% can’t be scheduled: %', coalesce(nm, 'This person'), why;
end $$;
drop trigger if exists shifts_cleared on shifts;
create trigger shifts_cleared before insert or update of profile_id on shifts for each row execute function shifts_cleared_check();

-- ⏰ Every morning: expiry reminders, and open the next 7 days of shifts for anyone not cleared.
create or replace function cert_daily() returns int language plpgsql security definer set search_path = public as $$
declare r record; pid uuid; n int := 0; bucket text; days int; why text; opened int;
begin
  -- 1. Reminders (each certificate kind, once per bucket: 30 days, 7 days, expired).
  for r in
    select p.id, p.full_name, p.home_id, k.kind, cert_until(p.id, k.kind) as until
      from profiles p cross join (values ('crc'), ('first_aid'), ('nvci'), ('driver'), ('meds')) k(kind)
     where p.active and p.role <> 'family' and p.staff_group is null
  loop
    continue when r.until is null or r.until = 'infinity'::date;
    days := r.until - current_date;
    bucket := case when days < 0 then 'exp' when days <= 7 then '7' when days <= 30 then '30' else null end;
    continue when bucket is null;
    for pid in select r.id union select x from house_leaders(r.home_id) x where r.home_id is not null loop
      perform notify(pid,
        case when bucket = 'exp' then '⛔ Expired: ' else '⏰ Renew soon: ' end || cert_label(r.kind) ||
          case when pid = r.id then '' else ' — ' || r.full_name end,
        case when bucket = 'exp'
             then 'Expired on ' || to_char(r.until, 'Mon DD, YYYY') || '. ' ||
                  case when r.kind in ('crc', 'first_aid', 'nvci') then 'Off the schedule until renewed. ' else '' end ||
                  'Upload the new certificate in HR.'
             else 'Expires on ' || to_char(r.until, 'Mon DD, YYYY') || ' (' || days || ' days). Book the renewal now and upload the new certificate in HR.' end,
        '/hr/' || r.id, 'cert' || bucket || ':' || r.id || ':' || r.kind || ':' || r.until || ':' || pid);
      n := n + 1;
    end loop;
  end loop;

  -- 2. Shifts in the next 7 days for anyone not cleared become open shifts.
  for r in
    select s.profile_id, p.full_name, p.home_id, min(s.shift_date) as first_day, array_agg(s.id) as ids
      from shifts s join profiles p on p.id = s.profile_id
     where s.shift_date between current_date and current_date + 7 and cleared_on(s.profile_id, s.shift_date) is not null
     group by s.profile_id, p.full_name, p.home_id
  loop
    why := cleared_on(r.profile_id, r.first_day);
    update shifts set profile_id = null, open_reason = why, source = 'changed' where id = any (r.ids);
    get diagnostics opened = row_count;
    for pid in select r.profile_id union select x from house_leaders(r.home_id) x where r.home_id is not null loop
      perform notify(pid, '⛔ Off the schedule: ' || r.full_name,
        opened || ' shift(s) in the next 7 days are now open shifts. ' || why || ' Upload the renewed certificate in HR, then the shifts can be given back.',
        '/schedule?tab=open', 'certoff:' || r.profile_id || ':' || current_date || ':' || pid);
    end loop;
    n := n + opened;
  end loop;
  return n;
end $$;
revoke execute on function cert_daily() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('evergreen-cert-daily') where exists (select 1 from cron.job where jobname = 'evergreen-cert-daily');
  perform cron.schedule('evergreen-cert-daily', '20 14 * * *', 'select public.cert_daily()');   -- 7:20 am Vancouver (PDT)
exception when others then
  raise notice 'Scheduler not available here (%).', sqlerrm;
end $$;

select 'cert expiry ready' as result;
