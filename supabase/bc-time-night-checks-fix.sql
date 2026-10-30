-- B.C. time fix for night checks and missing-record alerts (Oct 30, 2026).
-- B.C. stays on UTC-7 all year from 2026, but the database's 'America/Vancouver' clock still falls back on Nov 1.
-- Both jobs now use evg_tz() (fixed UTC-7), like the rest of the CRM. Run as migration bc_time_night_checks_alerts.

create or replace function night_checks_tick() returns void language plpgsql security definer set search_path = public as $$
declare s record; st timestamptz; en timestamptz; r record; ldr uuid; who text; hname text;
begin
  -- 1. Build the checks for night shifts that start within the last day or in the next 12 hours.
  for s in
    select sh.* from shifts sh
    where sh.label in ('Awake night', 'Sleep night') and sh.profile_id is not null
      and ((sh.shift_date + sh.start_time) at time zone evg_tz()) between now() - interval '1 day' and now() + interval '12 hours'
  loop
    st := (s.shift_date + s.start_time) at time zone evg_tz();
    en := st + make_interval(secs => mod((extract(epoch from s.end_time) - extract(epoch from s.start_time))::int + 86400, 86400));

    -- Every 2 hours after the start (both shift types).
    insert into night_checks (shift_id, home_id, profile_id, kind, slot, due_at, window_until)
    select s.id, s.home_id, s.profile_id, 'Scheduled', g, st + g * interval '120 minutes', st + g * interval '120 minutes' + interval '15 minutes'
    from generate_series(1, 20) g
    where st + g * interval '120 minutes' < en
    on conflict (shift_id, kind, slot) do nothing;

    -- About every 32 minutes, at a random moment in each 32-minute block (Awake night only).
    if s.label = 'Awake night' then
      insert into night_checks (shift_id, home_id, profile_id, kind, slot, due_at, window_until)
      select s.id, s.home_id, s.profile_id, 'Random', x.g, x.d, x.d + interval '5 minutes'
      from (
        select g, st + g * interval '32 minutes' + floor(random() * 27) * interval '1 minute' as d
        from generate_series(0, 30) g
        where st + g * interval '32 minutes' < en
      ) x
      on conflict (shift_id, kind, slot) do nothing;
    end if;
  end loop;

  -- 2. If the shift was given to someone else, move its open checks to them.
  update night_checks n set profile_id = sh.profile_id
  from shifts sh
  where n.shift_id = sh.id and n.profile_id is distinct from sh.profile_id and n.status in ('Waiting', 'Due');

  -- 3. Checks whose window has passed without a check-in → Missed, and the house's leaders are alerted.
  for r in
    update night_checks set status = 'Missed'
    where status in ('Waiting', 'Due') and window_until <= now()
    returning *
  loop
    select full_name into who from profiles where id = r.profile_id;
    select name into hname from homes where id = r.home_id;
    -- Leaders of the house, except the person who is on the shift (a PC or PM who works a night doesn't alert themselves).
    for ldr in select l from house_leaders(r.home_id) l where l <> r.profile_id loop
      perform notify_now(ldr, '⚠️ Night check missed: ' || coalesce(who, 'staff'),
        coalesce(hname, 'House') || ' · ' || case when r.kind = 'Scheduled' then '2-hour check' else 'random check' end
          || ' due ' || to_char(r.due_at at time zone evg_tz(), 'HH24:MI') || ' · not done in time',
        '/homes/' || r.home_id, 'ncm:' || r.id || ':' || ldr);
    end loop;
  end loop;

  -- 4. Checks that are due now → Due, and the staff member is notified in the app.
  for r in
    update night_checks set status = 'Due'
    where status = 'Waiting' and due_at <= now() and window_until > now()
    returning *
  loop
    perform notify(r.profile_id,
      case when r.kind = 'Scheduled' then '📍 Night check-in due' else '🔔 Night check now' end,
      'Tap “Night check” on your phone at the house within ' || (case when r.kind = 'Scheduled' then '15' else '5' end) || ' minutes.',
      '/id#night', 'nc:' || r.id);
  end loop;
end $$;
revoke execute on function night_checks_tick() from public, anon, authenticated;

create or replace function missing_records_alerts() returns void language plpgsql security definer set search_path = public as $$
declare
  t date := (now() at time zone evg_tz())::date;
  hr int := extract(hour from (now() at time zone evg_tz()))::int;
  wk text := to_char(date_trunc('week', now() at time zone evg_tz()), 'YYYY-MM-DD');
  r record; g record; s record; k text; ldr uuid; nm text; hname text;
begin
  if hr < 10 then return; end if;

  -- 1. Daily records not entered today.
  for r in
    select res.id as rid, res.home_id as hid, hm.program as prog, hm.name as hname,
      coalesce(res.preferred_name, res.first_name) || ' ' || res.last_name as nm
    from residents res join homes hm on hm.id = res.home_id
    where res.status <> 'discharged' and hm.program in ('MCFD', 'CLBC')
  loop
    foreach k in array (case when r.prog = 'MCFD' then array['day_book', 'wellness_check'] else array['clbc_day', 'clbc_wellness'] end) loop
      if not exists (select 1 from entries e where e.resident_id = r.rid and e.kind = k and e.entry_date = t) then
        for ldr in select l from house_leaders(r.hid) l loop
          perform notify_now(ldr,
            '⚠️ Not entered today: ' || r.nm,
            r.hname || ' · ' || case k
              when 'day_book' then 'day book (MCFD C.1.11)'
              when 'wellness_check' then 'daily safety and wellness check (MCFD C.1.12)'
              when 'clbc_day' then 'daily support note (CLBC)'
              else 'daily health and wellbeing check (CLBC)' end || ' · not entered by ' || to_char(now() at time zone evg_tz(), 'HH24:MI'),
            '/residents/' || r.rid || '?tab=logs&type=' || k,
            'miss:' || r.rid || ':' || k || ':' || t || ':' || ldr);
        end loop;
      end if;
    end loop;
  end loop;

  -- 2. Goal reviews overdue (once a week per goal).
  for g in
    select go.id as gid, go.title, go.review_date, res.id as rid, res.home_id as hid, hm.name as hname,
      coalesce(res.preferred_name, res.first_name) || ' ' || res.last_name as nm
    from goals go join residents res on res.id = go.resident_id join homes hm on hm.id = res.home_id
    where go.status = 'Active' and go.review_date is not null and go.review_date < t and res.status <> 'discharged'
  loop
    for ldr in select l from house_leaders(g.hid) l loop
      perform notify_now(ldr, '⚠️ Goal review overdue: ' || g.nm,
        g.hname || ' · “' || g.title || '” was due for review ' || to_char(g.review_date, 'YYYY-MM-DD'),
        '/residents/' || g.rid || '?tab=goals',
        'goalrev:' || g.gid || ':' || ldr || ':' || wk);
    end loop;
  end loop;

  -- 3. Care plan review overdue (once a week per resident).
  for r in
    select res.id as rid, res.home_id as hid, hm.name as hname, res.care_plan_review_date as due,
      coalesce(res.preferred_name, res.first_name) || ' ' || res.last_name as nm
    from residents res join homes hm on hm.id = res.home_id
    where res.status <> 'discharged' and res.care_plan_review_date is not null and res.care_plan_review_date < t
  loop
    for ldr in select l from house_leaders(r.hid) l loop
      perform notify_now(ldr, '⚠️ Care plan review overdue: ' || r.nm,
        r.hname || ' · care plan review was due ' || to_char(r.due, 'YYYY-MM-DD'),
        '/residents/' || r.rid,
        'cpr:' || r.rid || ':' || ldr || ':' || wk);
    end loop;
  end loop;

  -- 4. Staff performance review and supervision overdue (every 3 months), once a week per person.
  for s in
    select p.id as pid, p.home_id as hid, hm.name as hname, p.full_name as nm,
      (select max(record_on) from staff_file_records x where x.profile_id = p.id and x.kind = 'performance_evaluation') as last_ev,
      (select max(record_on) from staff_file_records x where x.profile_id = p.id and x.kind = 'supervision') as last_sup
    from profiles p join homes hm on hm.id = p.home_id
    where p.active and p.home_id is not null and p.role <> 'family'
  loop
    if s.last_ev is null or s.last_ev + interval '3 months' < t then
      for ldr in select l from house_leaders(s.hid) l where l <> s.pid loop
        perform notify_now(ldr, '⚠️ Performance review overdue: ' || s.nm,
          s.hname || ' · no performance review in the last 3 months' || case when s.last_ev is null then ' (none on file)' else ' (last ' || to_char(s.last_ev, 'YYYY-MM-DD') || ')' end,
          '/hr/' || s.pid || '/records', 'perf:' || s.pid || ':' || ldr || ':' || wk);
      end loop;
    end if;
    if s.last_sup is null or s.last_sup + interval '3 months' < t then
      for ldr in select l from house_leaders(s.hid) l where l <> s.pid loop
        perform notify_now(ldr, '⚠️ Supervision overdue: ' || s.nm,
          s.hname || ' · no supervision recorded in the last 3 months' || case when s.last_sup is null then ' (none on file)' else ' (last ' || to_char(s.last_sup, 'YYYY-MM-DD') || ')' end,
          '/hr/' || s.pid || '/records', 'sup:' || s.pid || ':' || ldr || ':' || wk);
      end loop;
    end if;
  end loop;
end $$;

revoke execute on function missing_records_alerts() from public, anon, authenticated;
