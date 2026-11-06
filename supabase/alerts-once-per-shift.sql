-- =====================================================================
-- Evergreen CRM - "Below staffing" alert once per shift, not every hour (Nov 5, 2026).
-- Before: while a house was short, every leader got a new urgent alert and email EVERY HOUR
-- (232 in one week on test data). Now each leader gets:
--   1. one alert when the house is below its scheduled staffing (15 min after a shift starts),
--   2. one more "still below staffing" alert if it is still short an hour later,
--   3. a new alert when the next shift starts and the house is short again.
-- Nothing else in attendance_tick changes. Run as migration alerts_once_per_shift.
-- =====================================================================
create or replace function public.attendance_tick()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare st schedule_settings; r record; n_nci int := 0; n_cov int := 0; n_out int := 0; n_ratio int := 0; s_at timestamptz; wait_until timestamptz; aid uuid;
begin
  select * into st from schedule_settings where id = 1;
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

  -- C. House below the scheduled staffing (a shift started at least 15 min ago).
  --    One alert per leader for this shortage; one reminder an hour later; a new shift start begins a new one.
  for r in
    select h.id as home_id, h.name, count(x.id) as needed,
           max(shift_start_ts(x.shift_date, x.start_time)) as latest_start,
           (select count(*) from time_entries t where t.home_id = h.id and t.clock_out is null) as present
      from homes h
      join shifts x on x.home_id = h.id and x.shift_date between current_date - 1 and current_date
        and shift_start_ts(x.shift_date, x.start_time) <= now() - make_interval(mins => coalesce(st.noshow_alert_min, 15))
        and shift_end_ts(x.shift_date, x.start_time, x.end_time) > now()
     group by h.id, h.name
  loop
    if r.present < r.needed then
      perform notify_now(l, '🔴 Below staffing: ' || r.name, r.present || ' of ' || r.needed || ' scheduled staff are clocked in right now.', '/attendance',
                         'ratio:' || r.home_id || ':' || to_char(r.latest_start at time zone evg_tz(), 'YYYY-MM-DD-HH24MI') || ':' || l)
        from house_leaders(r.home_id) l;
      if now() >= r.latest_start + make_interval(mins => coalesce(st.noshow_alert_min, 15)) + interval '60 minutes' then
        perform notify_now(l, '🔴 Still below staffing after 1 hour: ' || r.name, r.present || ' of ' || r.needed || ' scheduled staff are clocked in. Call on-call or the Program Manager.', '/attendance',
                           'ratio2:' || r.home_id || ':' || to_char(r.latest_start at time zone evg_tz(), 'YYYY-MM-DD-HH24MI') || ':' || l)
          from house_leaders(r.home_id) l;
      end if;
      n_ratio := n_ratio + 1;
    end if;
  end loop;

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
end $function$;
revoke execute on function public.attendance_tick() from public, anon, authenticated;
