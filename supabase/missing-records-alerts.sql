-- =====================================================================
-- Evergreen CRM - Missing-record alerts for house leaders (Program Coordinator, Program Manager).
-- Runs every hour (pg_cron). Checks from 10:00 Vancouver time, so a shift has had time to write.
-- Alerts (each once per item per day, or once per week for reviews):
--   1. Daily record not entered today for a current resident: MCFD day book and wellness check, CLBC daily note and health check.
--   2. Goal review overdue (goals.review_date passed while the goal is Active).
--   3. Care plan review overdue (residents.care_plan_review_date passed).
--   4. Staff performance review overdue (every 3 months) or supervision overdue (every 3 months).
-- Uses house_leaders() and notify_now(), as the night checks do. Safe to run more than once.
-- =====================================================================

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

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('evergreen-missing-records') where exists (select 1 from cron.job where jobname = 'evergreen-missing-records');
  perform cron.schedule('evergreen-missing-records', '0 * * * *', 'select public.missing_records_alerts()');
exception when others then
  raise notice 'Scheduler not available here (%).', sqlerrm;
end $$;
