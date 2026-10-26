-- =====================================================================
-- Evergreen CRM - Attendance: clock in to your shift, late / no-show alerts, "Can't make my shift",
-- "Running late", forgot-to-clock-out reminders, and urgent alerts emailed within minutes, day or night.
-- Safe to run more than once. Run after modules-2.sql, schedule-teams.sql, safe-shifts.sql,
-- shift-checklists.sql (house_leaders), cert-expiry.sql (cleared_on) and help-email-gaps.sql (urgent emails).
--
-- Melvin's settings (Oct 26, 2026): clock in up to 15 min early · late after 5 min · not clocked in 15 min after the
-- start → alert, 30 min → Program Manager · a sick shift is offered to the same house first, all houses after
-- 30 min · a pick-up is assigned straight away (the Program Coordinator is told). Text messages come later (Twilio).
--
--  1. Clock in matches today's scheduled shift. More than 15 min early → "you can clock in from …".
--     More than 5 min late → marked late; the staff member adds a reason. No shift → allowed, marked unscheduled.
--  2. Clock out more than 15 min after the shift ended needs a reason (the Note box).
--  3. 📞 Can't make my shift (sick / family emergency / other — no medical details): the shift opens straight away,
--     the house's Program Coordinator and Program Manager get an urgent alert, cleared staff of the same house who
--     can take it are told. 30 min later it opens to all houses; not filled → Program Manager; still empty at the
--     start → Director of Operations.
--  4. ⏰ Running late: tells the house leaders, and the no-show alert waits for the time given.
--  5. Every 5 minutes: not clocked in 15 min after the start → staff + Program Coordinator; 30 min → Program Manager
--     and a "possible no-show" the PC confirms (No-show) or excuses. House below the scheduled staffing → urgent.
--     Forgot to clock out: staff 30 min after the end, PC after 2 hours.
--  6. Urgent alerts are emailed within about 2 minutes, even when nobody has the portal open (pg_net calls the
--     site's /api/cron/urgent; the key is kept in the Supabase Vault).
-- Sick calls never count against the performance badge. Late arrivals and confirmed no-shows do.
-- =====================================================================

-- ---------- Settings ----------
alter table schedule_settings add column if not exists clock_in_early_min int not null default 15;
alter table schedule_settings add column if not exists late_after_min     int not null default 5;
alter table schedule_settings add column if not exists noshow_alert_min   int not null default 15;
alter table schedule_settings add column if not exists noshow_pm_min      int not null default 30;
alter table schedule_settings add column if not exists cover_all_min      int not null default 30;
alter table schedule_settings add column if not exists overtime_reason_min int not null default 15;

-- ---------- Columns ----------
alter table time_entries add column if not exists shift_id         uuid references shifts on delete set null;
alter table time_entries add column if not exists late_minutes     int;
alter table time_entries add column if not exists late_reason      text;
alter table time_entries add column if not exists overtime_minutes int;
alter table time_entries add column if not exists unscheduled      boolean not null default false;
create index if not exists time_entries_shift on time_entries (shift_id);

alter table shifts add column if not exists cover_needed_at timestamptz;   -- someone called in; the shift needs cover
alter table shifts add column if not exists cover_all_at    timestamptz;   -- opened to every house
alter table shifts add column if not exists cover_pm_at     timestamptz;   -- Program Manager told it isn't covered
alter table shifts add column if not exists cover_doo_at    timestamptz;   -- Director of Operations told (shift started empty)

-- ---------- Absences: called in, running late, possible / confirmed no-show ----------
create table if not exists shift_absences (
  id            uuid primary key default gen_random_uuid(),
  shift_id      uuid references shifts on delete set null,
  profile_id    uuid not null references profiles on delete cascade,
  home_id       uuid references homes,
  shift_date    date not null,
  shift_label   text,
  starts_at     timestamptz not null,
  kind          text not null check (kind in ('Sick', 'Family emergency', 'Other', 'Running late', 'Not clocked in')),
  status        text not null check (status in ('Called in', 'Running late', 'Possible no-show', 'No-show', 'Excused', 'Late arrival')),
  hours_notice  numeric(6,1),
  eta_minutes   int,
  note          text check (length(note) <= 300),
  reported_at   timestamptz not null default now(),
  decided_by    uuid references profiles,
  decided_at    timestamptz,
  decision_note text
);
create index if not exists shift_absences_who on shift_absences (profile_id, shift_date desc);
create index if not exists shift_absences_home on shift_absences (home_id, shift_date desc);
create unique index if not exists shift_absences_one_call on shift_absences (shift_id, profile_id) where kind in ('Sick', 'Family emergency', 'Other');
create unique index if not exists shift_absences_one_noshow on shift_absences (shift_id, profile_id) where kind = 'Not clocked in';
alter table shift_absences enable row level security;
drop policy if exists absences_read on shift_absences;
-- Own records; the house's Program Coordinator; Program Manager and up; Payroll (sick days).
create policy absences_read on shift_absences for select to authenticated using (
  profile_id = auth.uid()
  or (app_group() is null and coalesce(app_level(), 0) >= 3)
  or (app_group() is null and coalesce(app_level(), 0) = 2 and home_id = app_home())
  or coalesce(app_group(), '') = 'payroll');
-- Changes only through the functions below.
drop trigger if exists audit_shift_absences on shift_absences;
create trigger audit_shift_absences after insert or update or delete on shift_absences for each row execute function write_audit();

-- Program Coordinators see clock in / out times for their own house (the Attendance board).
drop policy if exists "pc time see" on time_entries;
create policy "pc time see" on time_entries for select to authenticated using (
  app_group() is null and coalesce(app_level(), 0) = 2 and home_id is not null and home_id = app_home());

-- Staff from another house can see a sick shift once it is opened to every house.
drop policy if exists "cover shifts see" on shifts;
create policy "cover shifts see" on shifts for select to authenticated using (
  profile_id is null and cover_all_at is not null and app_group() is null and coalesce(app_level(), 0) >= 1);

-- ---------- Helpers ----------
-- B.C. time. B.C. moved to permanent daylight time in 2026 (UTC−7 all year; clocks did not fall back on
-- Nov 1, 2026). Supabase's time-zone data may still expect the old change, so this uses a fixed UTC−7.
-- ('Etc/GMT+7' means UTC−7 — the sign is reversed in these names.)
create or replace function evg_tz() returns text language sql immutable as $$ select 'Etc/GMT+7' $$;
create or replace function shift_start_ts(p_date date, p_start time) returns timestamptz
language sql stable as $$ select (p_date + p_start) at time zone evg_tz() $$;
create or replace function shift_end_ts(p_date date, p_start time, p_end time) returns timestamptz
language sql stable as $$ select (p_date + p_end + case when p_end <= p_start then interval '1 day' else interval '0' end) at time zone evg_tz() $$;

-- An alert that is emailed right away (and texted later, once Twilio is set up).
create or replace function notify_now(pid uuid, t text, b text, l text, k text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if pid is null then return; end if;
  insert into notifications (profile_id, title, body, link, dedupe_key, urgent) values (pid, t, b, l, k, true)
  on conflict (dedupe_key) do nothing;
end $$;
revoke execute on function notify_now(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function house_pcs(p_home uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  select id from profiles where active and staff_group is null and level = 2 and home_id = p_home;
$$;
create or replace function house_pms(p_home uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  select l from house_leaders(p_home) l join profiles p on p.id = l where p.level = 3;
$$;
revoke execute on function house_pcs(uuid) from public, anon, authenticated;
revoke execute on function house_pms(uuid) from public, anon, authenticated;

create or replace function hm(t time) returns text language sql immutable as $$
  select to_char(date '2000-01-01' + t, 'FMHH12:MI am');
$$;
create or replace function hm_ts(t timestamptz) returns text language sql stable as $$
  select to_char(t at time zone evg_tz(), 'FMHH12:MI am');
$$;
create or replace function shift_words(p_shift uuid) returns text language sql stable security definer set search_path = public as $$
  select to_char(s.shift_date, 'Dy Mon DD') || ' · ' || coalesce(s.label, 'Shift') || ' ' || hm(s.start_time)
         || ' · ' || coalesce((select name from homes where id = s.home_id), '')
    from shifts s where s.id = p_shift;
$$;

-- Tell staff who could take this open shift (cleared to work, rest / hours / days-in-a-row OK).
-- p_all = false: same house (and staff with no house); true: every other house.
create or replace function offer_cover(p_shift uuid, p_all boolean) returns int
language plpgsql security definer set search_path = public as $$
declare s shifts; n int := 0; p record; soon boolean; t text;
begin
  select * into s from shifts where id = p_shift;
  if s.id is null or s.profile_id is not null then return 0; end if;
  soon := shift_start_ts(s.shift_date, s.start_time) < now() + interval '24 hours';
  t := '🙋 Cover needed: ' || shift_words(s.id);
  for p in
    select pr.id from profiles pr
     where pr.active and pr.role = 'staff' and pr.staff_group is null and coalesce(pr.level, 1) <= 2
       and (case when p_all then pr.home_id is distinct from s.home_id and pr.home_id is not null
                 else pr.home_id = s.home_id or pr.home_id is null end)
       and not exists (select 1 from shift_absences a where a.shift_id = s.id and a.profile_id = pr.id)
       and not exists (select 1 from protected_days d where d.profile_id = pr.id and d.day = s.shift_date)
       and cleared_on(pr.id, s.shift_date) is null
       and shift_fit(pr.id, s.id) is null
  loop
    if soon then perform notify_now(p.id, t, 'Tap to pick it up — first to accept gets it.', '/schedule?tab=open', 'cov:' || s.id || ':' || p.id);
    else perform notify(p.id, t, 'Tap to pick it up — first to accept gets it.', '/schedule?tab=open', 'cov:' || s.id || ':' || p.id); end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function offer_cover(uuid, boolean) from public, anon, authenticated;

-- ---------- 1. Clock in (matches today's shift) ----------
create or replace function clock_in_safely(p_home uuid, p_lat double precision, p_lng double precision, p_acc int, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pl record; perm uuid; te uuid; st schedule_settings; sh shifts; nxt shifts; s_at timestamptz; late int; me profiles;
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if p_home is null then raise exception 'Choose your house.'; end if;
  if exists (select 1 from time_entries where profile_id = auth.uid() and clock_out is null) then raise exception 'You are already clocked in.'; end if;
  select * into st from schedule_settings where id = 1;
  -- Today's shift at this house: from 15 min before the start until it ends, not already clocked in.
  select * into sh from shifts x
   where x.profile_id = auth.uid() and x.home_id = p_home and x.shift_date between current_date - 1 and current_date + 1
     and shift_start_ts(x.shift_date, x.start_time) - make_interval(mins => coalesce(st.clock_in_early_min, 15)) <= now()
     and shift_end_ts(x.shift_date, x.start_time, x.end_time) > now()
     and not exists (select 1 from time_entries t where t.shift_id = x.id)
   order by shift_start_ts(x.shift_date, x.start_time) limit 1;
  if sh.id is null then
    select * into nxt from shifts x
     where x.profile_id = auth.uid() and x.home_id = p_home
       and shift_start_ts(x.shift_date, x.start_time) between now() and now() + interval '3 hours'
     order by shift_start_ts(x.shift_date, x.start_time) limit 1;
    if nxt.id is not null then
      raise exception 'Your % shift starts at %. You can clock in from % (% minutes before).', coalesce(nxt.label, ''),
        hm(nxt.start_time),
        hm(nxt.start_time - make_interval(mins => coalesce(st.clock_in_early_min, 15))),
        coalesce(st.clock_in_early_min, 15);
    end if;
  end if;
  select * into pl from shift_place(p_home, p_lat, p_lng, p_acc);
  if pl.home_set and not coalesce(pl.on_site, false) then
    perm := my_permission('Clock in');
    if perm is null then
      return jsonb_build_object('ok', false, 'need', 'Clock in', 'distance_m', pl.distance_m, 'no_location', p_lat is null);
    end if;
  end if;
  if sh.id is not null then
    s_at := shift_start_ts(sh.shift_date, sh.start_time);
    late := floor(extract(epoch from (now() - s_at)) / 60);
    if late <= coalesce(st.late_after_min, 5) then late := null; end if;
  end if;
  perform set_config('evg.safe_clock', '1', true);
  insert into time_entries (profile_id, home_id, notes, shift_id, late_minutes, unscheduled)
  values (auth.uid(), p_home, left(p_note, 300), sh.id, late, sh.id is null) returning id into te;
  insert into location_checkins (profile_id, time_entry_id, home_id, kind, lat, lng, accuracy_m, note)
  values (auth.uid(), te, p_home, 'Clock in', p_lat, p_lng, p_acc, left(p_note, 300));
  if perm is not null then update shift_permission_requests set status = 'Used', used_at = now(), time_entry_id = te where id = perm; end if;
  if sh.id is not null then
    -- Arrived: close any "running late" / "possible no-show" for this shift.
    update shift_absences set status = 'Late arrival', decided_at = now(), decision_note = 'Clocked in ' || coalesce(late, 0) || ' min after the start'
     where shift_id = sh.id and profile_id = auth.uid() and status in ('Running late', 'Possible no-show');
  else
    select * into me from profiles where id = auth.uid();
    perform notify(l, '🕒 Clocked in without a scheduled shift: ' || me.full_name,
                   coalesce((select name from homes where id = p_home), '') || ' · check the schedule or timesheet.', '/attendance', 'unsch:' || te || ':' || l)
      from house_pcs(p_home) l;
  end if;
  return jsonb_build_object('ok', true, 'entry', te, 'distance_m', pl.distance_m, 'on_site', pl.on_site, 'home_set', pl.home_set,
    'approved', perm is not null, 'shift', case when sh.id is null then null else shift_words(sh.id) end,
    'late', late, 'unscheduled', sh.id is null);
end $$;
grant execute on function clock_in_safely(uuid, double precision, double precision, int, text) to authenticated;

-- The reason for clocking in late (own entry only).
create or replace function set_late_reason(p_entry uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'Write a short reason.'; end if;
  update time_entries set late_reason = left(trim(p_reason), 300) where id = p_entry and profile_id = auth.uid() and late_minutes is not null;
  if not found then raise exception 'That time entry was not found.'; end if;
end $$;
grant execute on function set_late_reason(uuid, text) to authenticated;

-- ---------- 2. Clock out late needs a reason ----------
create or replace function time_entries_overtime() returns trigger language plpgsql security definer set search_path = public as $$
declare s shifts; st schedule_settings; ot int;
begin
  if old.clock_out is null and new.clock_out is not null and new.shift_id is not null then
    select * into s from shifts where id = new.shift_id;
    select * into st from schedule_settings where id = 1;
    if s.id is not null then
      ot := floor(extract(epoch from (new.clock_out - shift_end_ts(s.shift_date, s.start_time, s.end_time))) / 60);
      if ot > coalesce(st.overtime_reason_min, 15) then
        -- Staff clocking out themselves must say why (managers fixing a timesheet are not stopped).
        if coalesce(current_setting('evg.safe_clock', true), '') = '1' and new.notes is not distinct from old.notes then
          raise exception 'You are clocking out % minutes after your shift ended (%). Write why in the Note box, then tap Clock out again.',
            ot, hm(s.end_time);
        end if;
        new.overtime_minutes := ot;
      else
        new.overtime_minutes := null;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists time_entries_overtime on time_entries;
create trigger time_entries_overtime before update of clock_out on time_entries for each row execute function time_entries_overtime();

-- ---------- 3. Can't make my shift ----------
-- p_until: also every one of my shifts up to this day (max 14 days), e.g. sick for three days.
create or replace function cant_make_shift(p_shift uuid, p_kind text, p_note text default null, p_until date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profiles; first shifts; s shifts; n int := 0; hrs numeric; min_hrs numeric; homes_hit uuid[] := '{}'; who text;
begin
  select * into me from profiles where id = auth.uid() and active;
  if me.id is null then raise exception 'Please sign in again.'; end if;
  if p_kind not in ('Sick', 'Family emergency', 'Other') then raise exception 'Choose a reason: sick, family emergency or other.'; end if;
  select * into first from shifts where id = p_shift and profile_id = me.id;
  if first.id is null then raise exception 'That shift is not yours (it may already have been covered).'; end if;
  if p_until is not null and (p_until < first.shift_date or p_until > first.shift_date + 14) then raise exception 'Choose an end date within 14 days.'; end if;
  for s in select * from shifts x where x.profile_id = me.id
             and (x.id = first.id or (p_until is not null and x.shift_date between first.shift_date and p_until))
             and shift_end_ts(x.shift_date, x.start_time, x.end_time) > now()
             and not exists (select 1 from time_entries t where t.shift_id = x.id)
           order by x.shift_date, x.start_time for update loop
    hrs := round((extract(epoch from (shift_start_ts(s.shift_date, s.start_time) - now())) / 3600)::numeric, 1);
    min_hrs := least(coalesce(min_hrs, hrs), hrs);
    insert into shift_absences (shift_id, profile_id, home_id, shift_date, shift_label, starts_at, kind, status, hours_notice, note)
    values (s.id, me.id, s.home_id, s.shift_date, s.label, shift_start_ts(s.shift_date, s.start_time), p_kind, 'Called in', hrs, left(nullif(trim(p_note), ''), 300))
    on conflict do nothing;
    update shifts set profile_id = null, offered = false, offered_note = null, source = 'changed',
      open_reason = 'Called in (' || lower(p_kind) || ')', cover_needed_at = now(), cover_all_at = null, cover_pm_at = null, cover_doo_at = null
     where id = s.id;
    update shift_pickups set status = 'Cancelled' where shift_id = s.id and status = 'Pending';
    who := me.full_name || ' called in (' || lower(p_kind) || ')' || case when hrs < 4 then ' · less than 4 hours’ notice' else '' end;
    perform notify_now(l, '📞 Can’t make shift: ' || shift_words(s.id), who || '. The shift is open now — staff who can take it were told.',
                       '/attendance', 'cin:' || s.id || ':' || l)
      from house_leaders(s.home_id) l;
    perform offer_cover(s.id, false);
    n := n + 1;
    homes_hit := array_append(homes_hit, s.home_id);
  end loop;
  if n = 0 then raise exception 'That shift has already started or ended. Phone the on-call supervisor.'; end if;
  return jsonb_build_object('shifts', n, 'hours_notice', min_hrs,
    'on_call_phone', (select on_call_phone from homes where id = first.home_id),
    'house', (select name from homes where id = first.home_id));
end $$;
grant execute on function cant_make_shift(uuid, text, text, date) to authenticated;

-- ---------- 4. Running late ----------
create or replace function running_late(p_shift uuid, p_minutes int, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profiles; s shifts;
begin
  select * into me from profiles where id = auth.uid() and active;
  select * into s from shifts where id = p_shift and profile_id = auth.uid();
  if s.id is null then raise exception 'That shift is not yours.'; end if;
  if p_minutes is null or p_minutes < 5 or p_minutes > 180 then raise exception 'Choose how late you will be (5 to 180 minutes).'; end if;
  if shift_end_ts(s.shift_date, s.start_time, s.end_time) < now() then raise exception 'That shift has ended.'; end if;
  if shift_start_ts(s.shift_date, s.start_time) > now() + interval '6 hours' then raise exception 'That shift is more than 6 hours away. Use “Can’t make my shift” if you won’t be there.'; end if;
  if exists (select 1 from time_entries t where t.shift_id = s.id) then raise exception 'You are already clocked in for this shift.'; end if;
  delete from shift_absences where shift_id = s.id and profile_id = me.id and status = 'Running late';
  insert into shift_absences (shift_id, profile_id, home_id, shift_date, shift_label, starts_at, kind, status, eta_minutes, note)
  values (s.id, me.id, s.home_id, s.shift_date, s.label, shift_start_ts(s.shift_date, s.start_time), 'Running late', 'Running late', p_minutes, left(nullif(trim(p_note), ''), 300));
  perform notify_now(l, '⏰ Running late: ' || me.full_name, 'About ' || p_minutes || ' minutes late for ' || shift_words(s.id)
                     || coalesce(' — ' || nullif(trim(p_note), ''), ''), '/attendance', 'late:' || s.id || ':' || p_minutes || ':' || l)
    from house_leaders(s.home_id) l;
  return jsonb_build_object('ok', true, 'on_call_phone', (select on_call_phone from homes where id = s.home_id));
end $$;
grant execute on function running_late(uuid, int, text) to authenticated;

-- ---------- The Program Coordinator confirms a possible no-show, or excuses it ----------
create or replace function decide_absence(p_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a shift_absences;
begin
  select * into a from shift_absences where id = p_id;
  if a.id is null then raise exception 'Not found.'; end if;
  if not can_schedule(a.home_id) then raise exception 'Only the house’s Program Coordinator or a Program Manager can do this.'; end if;
  if p_status not in ('No-show', 'Excused') then raise exception 'Choose No-show or Excused.'; end if;
  if a.status not in ('Possible no-show', 'No-show', 'Excused', 'Running late') then raise exception 'This one is already “%”.', a.status; end if;
  if a.profile_id = auth.uid() then raise exception 'You can’t decide your own.'; end if;
  update shift_absences set status = p_status, decided_by = auth.uid(), decided_at = now(), decision_note = left(nullif(trim(p_note), ''), 300) where id = p_id;
  perform notify(a.profile_id, case when p_status = 'No-show' then '⛔ Recorded as a no-show: ' else '✅ Excused: ' end || to_char(a.shift_date, 'Dy Mon DD') || ' ' || coalesce(a.shift_label, ''),
                 coalesce(nullif(trim(p_note), ''), 'Talk to your Program Coordinator if you think this is wrong.'), '/absence', 'absd:' || p_id || ':' || p_status);
end $$;
grant execute on function decide_absence(uuid, text, text) to authenticated;

-- ---------- Picking up a sick shift: same house first, then everyone; assigned straight away ----------
create or replace function pick_up_shift(p_shift uuid) returns text
language plpgsql security definer set search_path = public as $$
declare s shifts; why text; me profiles; hname text; st schedule_settings; opens timestamptz;
begin
  select * into me from profiles where id = auth.uid() and active;
  select * into s from shifts where id = p_shift for update;
  if s.id is null or s.shift_date < current_date - 1 or shift_end_ts(s.shift_date, s.start_time, s.end_time) < now() then raise exception 'That shift is no longer available.'; end if;
  if s.profile_id = me.id then raise exception 'This is already your shift.'; end if;
  if s.profile_id is not null and not s.offered then raise exception 'Someone already has this shift.'; end if;
  if s.cover_needed_at is not null and s.cover_all_at is null and me.home_id is not null and me.home_id is distinct from s.home_id then
    select * into st from schedule_settings where id = 1;
    opens := s.cover_needed_at + make_interval(mins => coalesce(st.cover_all_min, 30));
    raise exception 'This shift is offered to that house’s staff first. It opens to everyone at %.', hm_ts(opens);
  end if;
  if exists (select 1 from shift_absences a where a.shift_id = s.id and a.profile_id = me.id and a.kind in ('Sick', 'Family emergency', 'Other')) then
    raise exception 'You called in for this shift.';
  end if;
  why := shift_fit(me.id, p_shift);
  if why is not null then raise exception '%', why; end if;
  select name into hname from homes where id = s.home_id;
  if s.profile_id is null then
    update shifts set profile_id = me.id, open_reason = null, source = 'changed',
      cover_needed_at = null, cover_all_at = null, cover_pm_at = null, cover_doo_at = null where id = p_shift;
    if s.cover_needed_at is not null then
      perform notify_now(l, '✅ Covered: ' || shift_words(s.id), me.full_name || ' picked it up.', '/attendance', 'cvd:' || p_shift || ':' || l)
        from house_leaders(s.home_id) l;
    else
      perform notify(l, '✅ Open shift filled: ' || to_char(s.shift_date, 'Dy Mon DD') || ' ' || s.label,
                     me.full_name || ' picked it up · ' || coalesce(hname, ''), '/schedule?tab=open', 'osf:' || p_shift || ':' || l)
        from house_leaders(s.home_id) l;
    end if;
    return 'taken';
  end if;
  insert into shift_pickups (shift_id, from_profile, to_profile) values (p_shift, s.profile_id, me.id);
  perform notify(l, '🔁 Shift swap to approve: ' || to_char(s.shift_date, 'Dy Mon DD') || ' ' || s.label,
                 me.full_name || ' wants to take this shift · ' || coalesce(hname, ''), '/schedule?tab=open', 'swp:' || p_shift || ':' || me.id || ':' || l)
    from house_leaders(s.home_id) l;
  return 'requested';
end $$;
grant execute on function pick_up_shift(uuid) to authenticated;

-- If a leader puts someone on a sick shift by hand, it is no longer "needs cover".
create or replace function shifts_cover_clear() returns trigger language plpgsql as $$
begin
  if new.profile_id is not null and new.cover_needed_at is not null then
    new.cover_needed_at := null; new.cover_all_at := null; new.cover_pm_at := null; new.cover_doo_at := null;
  end if;
  return new;
end $$;
drop trigger if exists shifts_cover_clear on shifts;
create trigger shifts_cover_clear before update of profile_id on shifts for each row execute function shifts_cover_clear();

-- ---------- 5. Every 5 minutes ----------
create or replace function attendance_tick() returns jsonb
language plpgsql security definer set search_path = public as $$
declare st schedule_settings; r record; n_nci int := 0; n_cov int := 0; n_out int := 0; n_ratio int := 0; s_at timestamptz; wait_until timestamptz; aid uuid;
begin
  select * into st from schedule_settings where id = 1;

  -- A. Scheduled but not clocked in.
  for r in
    select x.*, p.full_name, shift_start_ts(x.shift_date, x.start_time) as s_at,
           (select a.reported_at + make_interval(mins => a.eta_minutes) from shift_absences a
             where a.shift_id = x.id and a.profile_id = x.profile_id and a.status = 'Running late' order by a.reported_at desc limit 1) as eta_at
      from shifts x join profiles p on p.id = x.profile_id
     where x.profile_id is not null and x.shift_date between current_date - 1 and current_date
       and shift_start_ts(x.shift_date, x.start_time) between now() - interval '8 hours' and now() - make_interval(mins => coalesce(st.noshow_alert_min, 15))
       and shift_end_ts(x.shift_date, x.start_time, x.end_time) > now()
       and not exists (select 1 from time_entries t where t.shift_id = x.id)
       and not exists (select 1 from time_entries t where t.profile_id = x.profile_id and t.clock_out is null)
       and not exists (select 1 from shift_absences a where a.shift_id = x.id and a.profile_id = x.profile_id and a.status in ('No-show', 'Excused', 'Late arrival'))
  loop
    aid := null;
    -- Running late: wait until the time they gave, plus the usual grace.
    wait_until := greatest(r.s_at, coalesce(r.eta_at, r.s_at));
    if now() < wait_until + make_interval(mins => coalesce(st.noshow_alert_min, 15)) then continue; end if;
    perform notify_now(r.profile_id, '⏰ You haven’t clocked in for your shift', shift_words(r.id) || '. Clock in now — or tap “Can’t make my shift” and phone on-call.',
                       '/absence', 'nci1:' || r.id || ':' || r.profile_id);
    perform notify_now(l, '⏰ Not clocked in: ' || r.full_name, shift_words(r.id) || case when r.eta_at is not null then ' · said they were running late' else '' end,
                       '/attendance', 'nci1:' || r.id || ':' || l)
      from house_pcs(r.home_id) l;
    if now() >= wait_until + make_interval(mins => coalesce(st.noshow_pm_min, 30)) then
      insert into shift_absences (shift_id, profile_id, home_id, shift_date, shift_label, starts_at, kind, status)
      values (r.id, r.profile_id, r.home_id, r.shift_date, r.label, r.s_at, 'Not clocked in', 'Possible no-show')
      on conflict do nothing returning id into aid;
      if aid is not null then
        update shift_absences set status = 'Possible no-show' where shift_id = r.id and profile_id = r.profile_id and status = 'Running late';
      end if;
      perform notify_now(l, '⏰ Possible no-show: ' || r.full_name, shift_words(r.id) || ' · ' || floor(extract(epoch from (now() - r.s_at)) / 60) || ' min after the start. Confirm or excuse it on Attendance.',
                         '/attendance', 'nci2:' || r.id || ':' || l)
        from house_leaders(r.home_id) l;
    end if;
    n_nci := n_nci + 1;
  end loop;

  -- B. Sick shifts not covered yet.
  for r in select x.*, shift_start_ts(x.shift_date, x.start_time) as s_at from shifts x
            where x.profile_id is null and x.cover_needed_at is not null and shift_end_ts(x.shift_date, x.start_time, x.end_time) > now() loop
    if r.cover_all_at is null and now() >= r.cover_needed_at + make_interval(mins => coalesce(st.cover_all_min, 30)) then
      update shifts set cover_all_at = now() where id = r.id;
      perform offer_cover(r.id, true);
    end if;
    if r.cover_pm_at is null and now() >= r.cover_needed_at + (case when r.s_at - r.cover_needed_at < interval '4 hours' then interval '30 minutes' else interval '60 minutes' end) then
      update shifts set cover_pm_at = now() where id = r.id;
      perform notify_now(l, '⚠️ Not covered yet: ' || shift_words(r.id), 'Someone called in and nobody has picked it up. Assign someone on the Schedule.', '/schedule?tab=open', 'cpm:' || r.id || ':' || l)
        from house_pms(r.home_id) l;
    end if;
    if r.cover_doo_at is null and now() >= r.s_at then
      update shifts set cover_doo_at = now() where id = r.id;
      perform notify_now(p.id, '🔴 Shift started with nobody on it: ' || shift_words(r.id), 'The house may be below its staffing ratio. Call the Program Manager / on-call now.', '/attendance', 'cdoo:' || r.id || ':' || p.id)
        from profiles p where p.active and p.staff_group is null and p.level = 4;
    end if;
    n_cov := n_cov + 1;
  end loop;

  -- C. House below the scheduled staffing (shift started at least 15 min ago).
  for r in
    select h.id as home_id, h.name,
           (select count(*) from shifts x where x.home_id = h.id and x.shift_date between current_date - 1 and current_date
              and shift_start_ts(x.shift_date, x.start_time) <= now() - make_interval(mins => coalesce(st.noshow_alert_min, 15))
              and shift_end_ts(x.shift_date, x.start_time, x.end_time) > now()) as needed,
           (select count(*) from time_entries t where t.home_id = h.id and t.clock_out is null) as present
      from homes h
  loop
    if r.needed > 0 and r.present < r.needed then
      perform notify_now(l, '🔴 Below staffing: ' || r.name, r.present || ' of ' || r.needed || ' scheduled staff are clocked in right now.', '/attendance',
                         'ratio:' || r.home_id || ':' || to_char(now() at time zone evg_tz(), 'YYYY-MM-DD-HH24') || ':' || l)
        from house_leaders(r.home_id) l;
      n_ratio := n_ratio + 1;
    end if;
  end loop;

  -- D. Forgot to clock out.
  for r in
    select t.id, t.profile_id, t.home_id, t.clock_in, p.full_name,
           coalesce(shift_end_ts(x.shift_date, x.start_time, x.end_time), t.clock_in + interval '9 hours') as ends
      from time_entries t join profiles p on p.id = t.profile_id left join shifts x on x.id = t.shift_id
     where t.clock_out is null and t.clock_in > now() - interval '3 days'
  loop
    if now() >= r.ends + interval '30 minutes' then
      perform notify_now(r.profile_id, '⏱ Did you forget to clock out?', 'Your shift ended at ' || hm_ts(r.ends) || '. Clock out on My ID, or tell your Program Coordinator the time you left.',
                         '/id#checkin', 'fco1:' || r.id);
      n_out := n_out + 1;
    end if;
    if now() >= r.ends + interval '2 hours' then
      perform notify(l, '⏱ Still clocked in: ' || r.full_name, 'Shift ended at ' || hm_ts(r.ends) || '. Check they are safe, then fix the time on the timesheet.',
                     '/timesheet', 'fco2:' || r.id || ':' || l)
        from house_pcs(r.home_id) l;
    end if;
  end loop;

  return jsonb_build_object('not_clocked_in', n_nci, 'needs_cover', n_cov, 'below_staffing', n_ratio, 'forgot_out', n_out);
end $$;
revoke execute on function attendance_tick() from public, anon, authenticated;

-- ---------- 6. Urgent alerts by email within minutes (pg_net → the site) ----------
create extension if not exists pg_net;
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'urgent_flush_key') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'urgent_flush_key', 'Key for /api/cron/urgent');
  end if;
end $$;

-- The site checks the key it was sent (only the server key can call this).
create or replace function urgent_flush_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(length(p_key) >= 32 and p_key = (select decrypted_secret from vault.decrypted_secrets where name = 'urgent_flush_key'), false);
$$;
revoke execute on function urgent_flush_key_ok(text) from public, anon, authenticated;
grant execute on function urgent_flush_key_ok(text) to service_role;

-- Every 2 minutes: if any urgent alert is waiting to be emailed, ask the site to send it.
create or replace function ping_urgent_email() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from notifications where urgent and emailed_at is null and created_at > now() - interval '6 hours') then
    perform net.http_post(
      url := 'https://evergreen-crm-azure.vercel.app/api/cron/urgent',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-flush-key', (select decrypted_secret from vault.decrypted_secrets where name = 'urgent_flush_key')),
      body := '{}'::jsonb, timeout_milliseconds := 20000);
  end if;
end $$;
revoke execute on function ping_urgent_email() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('evergreen-attendance') where exists (select 1 from cron.job where jobname = 'evergreen-attendance');
  perform cron.schedule('evergreen-attendance', '*/5 * * * *', $c$select public.attendance_tick()$c$);
  perform cron.unschedule('evergreen-urgent-email') where exists (select 1 from cron.job where jobname = 'evergreen-urgent-email');
  perform cron.schedule('evergreen-urgent-email', '*/2 * * * *', $c$select public.ping_urgent_email()$c$);
exception when others then
  raise notice 'Scheduler not available here (%).', sqlerrm;
end $$;

-- Check: should say ready, 2 jobs
select 'attendance ready' as result,
       (select count(*) from cron.job where jobname in ('evergreen-attendance', 'evergreen-urgent-email')) as jobs,
       (select clock_in_early_min || ' min early · late after ' || late_after_min || ' min' from schedule_settings where id = 1) as settings;
