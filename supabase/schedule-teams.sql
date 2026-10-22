-- =====================================================================
-- Evergreen CRM - Automatic schedule: fixed teams and weekend partners.
--  * Every house has fixed DAY, EVENING and AWAKE NIGHT teams (and an optional 3–7 pm extra).
--    Nobody rotates between shifts.
--  * Each staff post is a pair of "lines": slot A (full-time, 9 shifts / 2 weeks = 36 h a week) and
--    slot B (part-time weekend partner, 5 shifts / 2 weeks = 20 h a week). They take turns on weekends,
--    so everyone gets every other weekend off. A second pair on the same shift starts a week later.
--        Week A:  Mon Tue Wed Thu Fri Sat Sun      Week B:  Mon Tue Wed Thu Fri Sat Sun
--        slot A:   A   A   .   .   A   A   A                .   A   A   A   A   .   .
--        slot B:   .   .   B   B   .   .   .                B   .   .   .   .   B   B
--  * The CRM keeps 6 months of shifts posted, adding a day every night.
--  * Time off, open shifts (pick up with rest and hours checks), offering your shift, protected days.
--  * Open-shift alerts: casual / part-time pool when a shift opens; Program Coordinator + Manager at 72 hours;
--    Director of Operations at 24 hours.
-- Needs: app_level(), app_home(), notify(), house_leaders(), shifts (modules-2.sql), homes shift times
-- (shift-checklists.sql), staff_details. Safe to run more than once.
-- =====================================================================

-- ---------- Settings ----------
create table if not exists schedule_settings (
  id              int primary key default 1 check (id = 1),
  pattern_anchor  date not null default '2026-11-02',   -- a Monday: the start of "Week A"
  horizon_days    int  not null default 183,           -- about 6 months
  ft_max_week     int  not null default 40,            -- hours in a Sunday–Saturday week (BC overtime line)
  pt_max_week     int  not null default 36,            -- part-time can pick up to this many hours a week
  min_rest_hours  int  not null default 11,            -- between the end of one shift and the start of the next
  max_in_a_row    int  not null default 5,
  updated_at      timestamptz not null default now()
);
insert into schedule_settings (id) values (1) on conflict (id) do nothing;
alter table schedule_settings enable row level security;
drop policy if exists "sched settings see" on schedule_settings;
create policy "sched settings see" on schedule_settings for select using (app_level() >= 1);

-- ---------- How many staff each house needs on each shift ----------
alter table homes add column if not exists staff_day     int not null default 1 check (staff_day between 0 and 4);
alter table homes add column if not exists staff_evening int not null default 1 check (staff_evening between 0 and 4);
alter table homes add column if not exists staff_night   int not null default 1 check (staff_night between 0 and 2);
alter table homes add column if not exists staff_peak    int not null default 0 check (staff_peak between 0 and 2);   -- 3–7 pm extra
alter table homes add column if not exists schedule_from date;   -- the pattern starts on this date (empty = not started)

-- ---------- Lines: one row per staff post slot ----------
create table if not exists schedule_lines (
  id          uuid primary key default gen_random_uuid(),
  home_id     uuid not null references homes on delete cascade,
  shift       text not null check (shift in ('Day', 'Evening', 'Night', 'Peak')),
  pair        int  not null check (pair between 1 and 4),
  slot        text not null check (slot in ('A', 'B')),       -- A = full-time pattern, B = weekend partner
  profile_id  uuid references profiles on delete set null,
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  unique (home_id, shift, pair, slot)
);
create unique index if not exists schedule_lines_one_per_person on schedule_lines (profile_id) where active and profile_id is not null;
alter table schedule_lines enable row level security;
drop policy if exists "lines see" on schedule_lines;
create policy "lines see" on schedule_lines for select using (
  app_level() >= 3 or profile_id = auth.uid() or (app_level() >= 1 and home_id = app_home()));

-- ---------- Shifts: where each one came from ----------
alter table shifts add column if not exists line_id     uuid references schedule_lines on delete set null;
alter table shifts add column if not exists source      text not null default 'manual';  -- manual | pattern | changed
alter table shifts add column if not exists open_reason text;
alter table shifts add column if not exists offered     boolean not null default false;
alter table shifts add column if not exists offered_note text;
create unique index if not exists shifts_line_day on shifts (line_id, shift_date) where line_id is not null;
create index if not exists shifts_open on shifts (shift_date) where profile_id is null;

-- ---------- Time off, protected days, pick-up requests ----------
create table if not exists time_off_requests (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles on delete cascade default auth.uid(),
  start_date  date not null,
  end_date    date not null,
  kind        text not null default 'Vacation' check (kind in ('Vacation', 'Personal', 'Sick', 'Family', 'Other')),
  note        text,
  status      text not null default 'Pending' check (status in ('Pending', 'Approved', 'Declined', 'Cancelled')),
  decided_by  uuid references profiles,
  decided_at  timestamptz,
  decision_note text,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 60)
);
create table if not exists protected_days (
  profile_id uuid not null references profiles on delete cascade default auth.uid(),
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, day)
);
create table if not exists shift_pickups (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references shifts on delete cascade,
  from_profile uuid references profiles on delete set null,
  to_profile  uuid not null references profiles on delete cascade,
  status      text not null default 'Pending' check (status in ('Pending', 'Approved', 'Declined', 'Cancelled')),
  decided_by  uuid references profiles,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table time_off_requests enable row level security;
alter table protected_days enable row level security;
alter table shift_pickups enable row level security;
drop policy if exists "timeoff see" on time_off_requests;
create policy "timeoff see" on time_off_requests for select using (
  profile_id = auth.uid() or app_level() >= 3
  or (app_level() = 2 and exists (select 1 from profiles p where p.id = profile_id and p.home_id = app_home())));
drop policy if exists "protected see" on protected_days;
create policy "protected see" on protected_days for select using (profile_id = auth.uid() or app_level() >= 2);
drop policy if exists "protected mine" on protected_days;
create policy "protected mine" on protected_days for insert with check (profile_id = auth.uid());
drop policy if exists "protected delete" on protected_days;
create policy "protected delete" on protected_days for delete using (profile_id = auth.uid());
drop policy if exists "pickups see" on shift_pickups;
create policy "pickups see" on shift_pickups for select using (
  to_profile = auth.uid() or from_profile = auth.uid() or app_level() >= 2);

-- At most 2 protected days a month, booked at least 7 days ahead.
create or replace function protected_days_rules() returns trigger language plpgsql as $$
begin
  if new.day < current_date + 7 then raise exception 'Pick protected days at least 7 days ahead.'; end if;
  if (select count(*) from protected_days where profile_id = new.profile_id
        and date_trunc('month', day) = date_trunc('month', new.day)) >= 2 then
    raise exception 'You already have 2 protected days in that month.';
  end if;
  return new;
end $$;
drop trigger if exists protected_days_rules on protected_days;
create trigger protected_days_rules before insert on protected_days for each row execute function protected_days_rules();

-- ---------- The pattern ----------
create or replace function pattern_works(p_slot text, p_pair int, p_day date) returns boolean
language sql stable set search_path = public as $$
  select case p_slot
    when 'A' then k in (0, 1, 4, 5, 6, 8, 9, 10, 11)
    else          k in (2, 3, 7, 12, 13) end
  from (select (((p_day - pattern_anchor) + case when p_pair % 2 = 0 then 7 else 0 end) % 14 + 14) % 14 as k
          from schedule_settings where id = 1) z;
$$;

-- Shift times for a house: start, end and label.
create or replace function line_times(p_home uuid, p_shift text, out st time, out en time, out lbl text)
language sql stable security definer set search_path = public as $$
  select case p_shift when 'Day' then h.shift_day_start when 'Evening' then h.shift_evening_start
                      when 'Night' then h.shift_night_start else time '15:00' end,
         case p_shift when 'Day' then h.shift_evening_start when 'Evening' then h.shift_night_start
                      when 'Night' then h.shift_day_start else time '19:00' end,
         case p_shift when 'Day' then 'Day' when 'Evening' then 'Evening' when 'Night' then 'Awake night' else 'Extra 3–7 pm' end
  from homes h where h.id = p_home;
$$;

-- Make sure each house has the right lines for its staffing (extra lines are switched off, never deleted).
create or replace function sync_house_lines(p_home uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h homes; s text; n int; i int; sl text;
begin
  select * into h from homes where id = p_home;
  foreach s in array array['Day', 'Evening', 'Night', 'Peak'] loop
    n := case s when 'Day' then h.staff_day when 'Evening' then h.staff_evening when 'Night' then h.staff_night else h.staff_peak end;
    for i in 1..4 loop
      foreach sl in array array['A', 'B'] loop
        if i <= n then
          insert into schedule_lines (home_id, shift, pair, slot) values (p_home, s, i, sl)
          on conflict (home_id, shift, pair, slot) do update set active = true;
        else
          update schedule_lines set active = false, updated_at = now() where home_id = p_home and shift = s and pair = i and slot = sl;
        end if;
      end loop;
    end loop;
  end loop;
end $$;

-- Build (or rebuild) a house's shifts from the pattern. Only untouched pattern shifts are ever changed:
-- anything changed by hand, time off, a pick-up or a swap ('changed' / 'manual') is left alone.
create or replace function build_schedule(p_home uuid default null, p_days int default null) returns int
language plpgsql security definer set search_path = public as $$
declare st schedule_settings; h record; l record; d date; t record; n int := 0; d0 date; d1 date; who uuid; why text;
begin
  select * into st from schedule_settings where id = 1;
  for h in select * from homes where (p_home is null or id = p_home) and schedule_from is not null loop
    perform sync_house_lines(h.id);
    d0 := greatest(current_date, h.schedule_from);
    d1 := current_date + coalesce(p_days, st.horizon_days);
    -- remove untouched future pattern shifts whose line was switched off
    delete from shifts s using schedule_lines l2
     where s.line_id = l2.id and l2.home_id = h.id and not l2.active and s.source = 'pattern' and s.shift_date >= d0;
    for l in select * from schedule_lines where home_id = h.id and active loop
      select * into t from line_times(h.id, l.shift);
      -- keep untouched future shifts in step with the person now on the line
      update shifts set profile_id = l.profile_id,
             open_reason = case when l.profile_id is null then 'No one on this line yet' else null end
       where line_id = l.id and source = 'pattern' and shift_date >= d0 and profile_id is distinct from l.profile_id;
      d := d0;
      while d <= d1 loop
        if pattern_works(l.slot, l.pair, d) then
          who := l.profile_id; why := case when l.profile_id is null then 'No one on this line yet' end;
          if who is not null and exists (select 1 from time_off_requests r where r.profile_id = who and r.status = 'Approved'
                                           and d between r.start_date and r.end_date) then
            who := null; why := 'Time off';
          end if;
          insert into shifts (home_id, profile_id, shift_date, start_time, end_time, label, line_id, source, open_reason, created_by)
          values (h.id, who, d, t.st, t.en, t.lbl, l.id, case when why = 'Time off' then 'changed' else 'pattern' end, why, null)
          on conflict (line_id, shift_date) where line_id is not null do nothing;
          if found then n := n + 1; end if;
        end if;
        d := d + 1;
      end loop;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function build_schedule(uuid, int) from public, anon, authenticated;

-- ---------- Who may run the schedule for a house ----------
create or replace function can_schedule(p_home uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app_level() >= 3 or (app_level() = 2 and p_home = app_home());
$$;

-- PM / PC: set staffing and start date, then build 6 months.
create or replace function save_house_staffing(p_home uuid, p_day int, p_evening int, p_night int, p_peak int, p_from date)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not can_schedule(p_home) then raise exception 'Only the house’s Program Coordinator or a Program Manager can change the schedule setup.'; end if;
  update homes set staff_day = p_day, staff_evening = p_evening, staff_night = p_night, staff_peak = p_peak,
                   schedule_from = p_from where id = p_home;
  return build_schedule(p_home);
end $$;
grant execute on function save_house_staffing(uuid, int, int, int, int, date) to authenticated;

create or replace function assign_line(p_line uuid, p_profile uuid) returns int
language plpgsql security definer set search_path = public as $$
declare l schedule_lines;
begin
  select * into l from schedule_lines where id = p_line;
  if l.id is null then raise exception 'Line not found.'; end if;
  if not can_schedule(l.home_id) then raise exception 'Only the house’s Program Coordinator or a Program Manager can assign lines.'; end if;
  if p_profile is not null and exists (select 1 from schedule_lines where profile_id = p_profile and active and id <> p_line) then
    raise exception 'That person already has a line. Remove them from it first.';
  end if;
  update schedule_lines set profile_id = p_profile, updated_at = now() where id = p_line;
  if p_profile is not null then
    perform notify(p_profile, '🗓 Your schedule is posted',
      'You are on the ' || lower(case l.shift when 'Peak' then '3–7 pm' else l.shift end) || ' team. Your shifts for the next 6 months are on the Schedule page.',
      '/schedule?tab=mine', 'line:' || p_line || ':' || p_profile);
  end if;
  return build_schedule(l.home_id);
end $$;
grant execute on function assign_line(uuid, uuid) to authenticated;

-- ---------- Rest and hours checks for a person taking a shift ----------
create or replace function shift_fit(p_profile uuid, p_shift uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare s shifts; st schedule_settings; a timestamptz; b timestamptz; wk0 date; hrs numeric; cap int; run int; dd date;
begin
  select * into s from shifts where id = p_shift;
  select * into st from schedule_settings where id = 1;
  a := (s.shift_date + s.start_time) at time zone 'America/Vancouver';
  b := (s.shift_date + s.end_time + case when s.end_time <= s.start_time then interval '1 day' else interval '0' end) at time zone 'America/Vancouver';
  if exists (select 1 from protected_days where profile_id = p_profile and day = s.shift_date) and p_profile <> auth.uid() then
    return 'This is one of their protected days.';
  end if;
  if exists (select 1 from time_off_requests where profile_id = p_profile and status = 'Approved' and s.shift_date between start_date and end_date) then
    return 'They have approved time off that day.';
  end if;
  if exists (
    select 1 from shifts x
     where x.profile_id = p_profile and x.id <> s.id and x.shift_date between s.shift_date - 1 and s.shift_date + 1
       and ((x.shift_date + x.start_time) at time zone 'America/Vancouver') < b + make_interval(hours => st.min_rest_hours)
       and ((x.shift_date + x.end_time + case when x.end_time <= x.start_time then interval '1 day' else interval '0' end) at time zone 'America/Vancouver')
           > a - make_interval(hours => st.min_rest_hours)) then
    return 'Too close to another shift: at least ' || st.min_rest_hours || ' hours of rest are needed between shifts.';
  end if;
  wk0 := s.shift_date - extract(dow from s.shift_date)::int;   -- Sunday
  select coalesce(sum(extract(epoch from (x.end_time - x.start_time + case when x.end_time <= x.start_time then interval '1 day' else interval '0' end)) / 3600), 0)
    into hrs from shifts x where x.profile_id = p_profile and x.shift_date between wk0 and wk0 + 6;
  hrs := hrs + extract(epoch from (b - a)) / 3600;
  cap := case when coalesce((select employment_type from staff_details where profile_id = p_profile), '') = 'Full-time' then st.ft_max_week else st.pt_max_week end;
  if hrs > cap then return 'That would be ' || round(hrs) || ' hours that week (the limit is ' || cap || ').'; end if;
  run := 1; dd := s.shift_date - 1;
  while exists (select 1 from shifts where profile_id = p_profile and shift_date = dd) loop run := run + 1; dd := dd - 1; end loop;
  dd := s.shift_date + 1;
  while exists (select 1 from shifts where profile_id = p_profile and shift_date = dd) loop run := run + 1; dd := dd + 1; end loop;
  if run > st.max_in_a_row then return 'That would be ' || run || ' shifts in a row (the limit is ' || st.max_in_a_row || ').'; end if;
  return null;
end $$;
grant execute on function shift_fit(uuid, uuid) to authenticated;

-- Pick up an open shift (straight away), or ask for an offered shift (the Program Coordinator approves).
create or replace function pick_up_shift(p_shift uuid) returns text
language plpgsql security definer set search_path = public as $$
declare s shifts; why text; me profiles; hname text;
begin
  select * into me from profiles where id = auth.uid() and active;
  select * into s from shifts where id = p_shift for update;
  if s.id is null or s.shift_date < current_date then raise exception 'That shift is no longer available.'; end if;
  if s.profile_id = me.id then raise exception 'This is already your shift.'; end if;
  if s.profile_id is not null and not s.offered then raise exception 'Someone already has this shift.'; end if;
  why := shift_fit(me.id, p_shift);
  if why is not null then raise exception '%', why; end if;
  select name into hname from homes where id = s.home_id;
  if s.profile_id is null then
    update shifts set profile_id = me.id, open_reason = null, source = 'changed' where id = p_shift;
    perform notify(l, '✅ Open shift filled: ' || to_char(s.shift_date, 'Dy Mon DD') || ' ' || s.label,
                   me.full_name || ' picked it up · ' || coalesce(hname, ''), '/schedule?tab=open', 'osf:' || p_shift || ':' || l)
      from house_leaders(s.home_id) l;
    return 'taken';
  end if;
  insert into shift_pickups (shift_id, from_profile, to_profile) values (p_shift, s.profile_id, me.id);
  perform notify(l, '🔁 Shift swap to approve: ' || to_char(s.shift_date, 'Dy Mon DD') || ' ' || s.label,
                 me.full_name || ' wants to take this shift · ' || coalesce(hname, ''), '/schedule?tab=open', 'swp:' || p_shift || ':' || me.id || ':' || l)
    from house_leaders(s.home_id) l;
  return 'requested';
end $$;
grant execute on function pick_up_shift(uuid) to authenticated;

create or replace function offer_shift(p_shift uuid, p_offer boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s shifts;
begin
  select * into s from shifts where id = p_shift;
  if s.profile_id is distinct from auth.uid() then raise exception 'You can only offer your own shifts.'; end if;
  if s.shift_date < current_date then raise exception 'That shift has passed.'; end if;
  update shifts set offered = p_offer, offered_note = case when p_offer then left(p_note, 200) end where id = p_shift;
  if not p_offer then update shift_pickups set status = 'Cancelled' where shift_id = p_shift and status = 'Pending'; end if;
end $$;
grant execute on function offer_shift(uuid, boolean, text) to authenticated;

create or replace function decide_pickup(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r shift_pickups; s shifts; why text;
begin
  select * into r from shift_pickups where id = p_id;
  select * into s from shifts where id = r.shift_id;
  if not can_schedule(s.home_id) then raise exception 'Only the house’s Program Coordinator or a Program Manager can approve swaps.'; end if;
  if r.status <> 'Pending' then raise exception 'This request was already %.', lower(r.status); end if;
  if p_approve then
    if s.profile_id is distinct from r.from_profile then raise exception 'The shift has changed since this was asked. Ask them to try again.'; end if;
    why := shift_fit(r.to_profile, s.id);
    if why is not null then raise exception '%', why; end if;
    update shifts set profile_id = r.to_profile, offered = false, offered_note = null, source = 'changed' where id = s.id;
    update shift_pickups set status = 'Cancelled' where shift_id = s.id and status = 'Pending' and id <> p_id;
  end if;
  update shift_pickups set status = case when p_approve then 'Approved' else 'Declined' end, decided_by = auth.uid(), decided_at = now() where id = p_id;
  perform notify(x, case when p_approve then '✅ Shift swap approved: ' else '⛔ Shift swap not approved: ' end || to_char(s.shift_date, 'Dy Mon DD') || ' ' || s.label,
                 null, '/schedule?tab=mine', 'swpd:' || p_id || ':' || x)
    from unnest(array[r.to_profile, r.from_profile]) x where x is not null;
end $$;
grant execute on function decide_pickup(uuid, boolean) to authenticated;

-- ---------- Time off ----------
create or replace function request_time_off(p_start date, p_end date, p_kind text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me profiles; rid uuid;
begin
  select * into me from profiles where id = auth.uid() and active;
  if p_end < p_start then raise exception 'The last day is before the first day.'; end if;
  if p_start < current_date and p_kind <> 'Sick' then raise exception 'Pick dates from today on.'; end if;
  insert into time_off_requests (profile_id, start_date, end_date, kind, note) values (me.id, p_start, p_end, p_kind, left(p_note, 500)) returning id into rid;
  perform notify(l, '🌴 Time off to approve: ' || me.full_name,
                 p_kind || ' · ' || to_char(p_start, 'Mon DD') || case when p_end > p_start then ' – ' || to_char(p_end, 'Mon DD') else '' end
                 || case when p_start < current_date + 28 and p_kind in ('Vacation', 'Personal') then ' · less than 4 weeks’ notice' else '' end,
                 '/schedule?tab=timeoff', 'tor:' || rid || ':' || l)
    from house_leaders(me.home_id) l where l <> me.id;
  return rid;
end $$;
grant execute on function request_time_off(date, date, text, text) to authenticated;

create or replace function decide_time_off(p_id uuid, p_approve boolean, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare r time_off_requests; them profiles; n int := 0;
begin
  select * into r from time_off_requests where id = p_id;
  select * into them from profiles where id = r.profile_id;
  if r.profile_id = auth.uid() then
    if p_approve then raise exception 'You can’t approve your own time off.'; end if;
    update time_off_requests set status = 'Cancelled' where id = p_id and status = 'Pending'; return 0;
  end if;
  if not can_schedule(them.home_id) then raise exception 'Only the Program Coordinator of their house or a Program Manager can decide this.'; end if;
  if r.status <> 'Pending' then raise exception 'This request was already %.', lower(r.status); end if;
  update time_off_requests set status = case when p_approve then 'Approved' else 'Declined' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 300) where id = p_id;
  if p_approve then
    update shifts set profile_id = null, offered = false, open_reason = 'Time off: ' || them.full_name, source = 'changed'
     where profile_id = r.profile_id and shift_date between greatest(r.start_date, current_date) and r.end_date;
    get diagnostics n = row_count;
  end if;
  perform notify(r.profile_id, case when p_approve then '✅ Time off approved' else '⛔ Time off not approved' end,
                 to_char(r.start_date, 'Mon DD') || case when r.end_date > r.start_date then ' – ' || to_char(r.end_date, 'Mon DD') else '' end
                 || coalesce(' — ' || nullif(trim(p_note), ''), ''), '/schedule?tab=timeoff', 'tod:' || p_id);
  return n;   -- shifts that are now open
end $$;
grant execute on function decide_time_off(uuid, boolean, text) to authenticated;

-- ---------- Open-shift alerts (every 2 hours) ----------
create or replace function open_shift_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare s record; n int := 0; hname text; whenx text;
begin
  -- Lines nobody is on yet: one reminder a day per house, not an alert per shift.
  perform notify(l, '👥 ' || x.n || ' shift' || case when x.n = 1 then '' else 's' end || ' in the next 3 days have nobody on the line yet',
                 x.hname || ': assign staff to the empty lines on the Schedule → Teams tab.', '/schedule?tab=teams', 'osg:' || x.home_id || ':' || current_date || ':' || l)
    from (select sh.home_id, h.name as hname, count(*) as n from shifts sh join homes h on h.id = sh.home_id
           where sh.profile_id is null and sh.open_reason = 'No one on this line yet' and sh.shift_date between current_date and current_date + 3
           group by 1, 2) x cross join lateral house_leaders(x.home_id) l;
  for s in select * from shifts where profile_id is null and shift_date between current_date and current_date + 14
             and coalesce(open_reason, '') <> 'No one on this line yet' loop
    select name into hname from homes where id = s.home_id;
    whenx := to_char(s.shift_date, 'Dy Mon DD') || ' · ' || s.label || ' · ' || coalesce(hname, '');
    -- the pick-up pool: part-time and casual staff of that house (or with no house), not on a protected day
    perform notify(p.id, '🙋 Open shift: ' || whenx, coalesce(s.open_reason, 'Pick it up on the Schedule page.'),
                   '/schedule?tab=open', 'osn:' || s.id || ':' || p.id)
      from profiles p left join staff_details d on d.profile_id = p.id
     where p.active and p.role = 'staff' and coalesce(p.level, 1) = 1 and p.staff_group is null
       and (p.home_id = s.home_id or p.home_id is null)
       and coalesce(d.employment_type, 'Casual') in ('Part-time', 'Casual')
       and not exists (select 1 from protected_days x where x.profile_id = p.id and x.day = s.shift_date)
       and not exists (select 1 from time_off_requests t where t.profile_id = p.id and t.status = 'Approved' and s.shift_date between t.start_date and t.end_date);
    if (s.shift_date + s.start_time) at time zone 'America/Vancouver' < now() + interval '72 hours' then
      perform notify(l, '⚠️ Open shift in 3 days or less: ' || whenx, 'Still nobody on it.', '/schedule?tab=open', 'os72:' || s.id || ':' || l)
        from house_leaders(s.home_id) l;
    end if;
    if (s.shift_date + s.start_time) at time zone 'America/Vancouver' < now() + interval '24 hours' then
      perform notify(p.id, '🔴 Open shift within 24 hours: ' || whenx, 'Still nobody on it.', '/schedule?tab=open', 'os24:' || s.id || ':' || p.id)
        from profiles p where p.active and p.staff_group is null and p.level = 4;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function open_shift_alerts() from public, anon, authenticated;

-- ---------- Scheduled jobs ----------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('evergreen-schedule-extend') where exists (select 1 from cron.job where jobname = 'evergreen-schedule-extend');
  perform cron.schedule('evergreen-schedule-extend', '10 10 * * *', $c$select public.build_schedule()$c$);   -- 3:10 am Vancouver
  perform cron.unschedule('evergreen-open-shifts') where exists (select 1 from cron.job where jobname = 'evergreen-open-shifts');
  perform cron.schedule('evergreen-open-shifts', '5 */2 * * *', $c$select public.open_shift_alerts()$c$);
exception when others then
  raise notice 'Scheduler not available here (%).', sqlerrm;
end $$;

select 'schedule teams ready' as result,
       (select pattern_anchor from schedule_settings) as week_a_starts,
       (select count(*) from homes) as houses;
