-- =====================================================================
-- Evergreen CRM - Night checks (Awake night and Sleep night shifts).
--  * Sleep night: a location check-in every 2 hours (at the house, inside the zone).
--  * Awake night: the same 2-hour check-in, plus a random check about every 32 minutes.
--  * A check that isn't done inside its window → "Missed". The house's Program Coordinator and
--    Program Managers get an urgent alert (which also goes out by email).
--  * Each shift can name its awake portion (shifts.night_role, e.g. "Awake residence worker").
-- Uses shift_place(), house_leaders(), notify(), notify_now(), app_level(), app_home().
-- Safe to run more than once.
-- =====================================================================

alter table shifts add column if not exists night_role text;

create table if not exists night_checks (
  id            uuid primary key default gen_random_uuid(),
  shift_id      uuid not null references shifts on delete cascade,
  home_id       uuid references homes,
  profile_id    uuid references profiles,
  kind          text not null check (kind in ('Scheduled', 'Random')),
  slot          int not null,
  due_at        timestamptz not null,
  window_until  timestamptz not null,
  status        text not null default 'Waiting' check (status in ('Waiting', 'Due', 'Done', 'Missed')),
  responded_at  timestamptz,
  lat           double precision,
  lng           double precision,
  distance_m    int,
  on_site       boolean,
  created_at    timestamptz not null default now(),
  unique (shift_id, kind, slot)
);
create index if not exists nc_open on night_checks (status, due_at);
alter table night_checks enable row level security;
drop policy if exists nc_read on night_checks;
create policy nc_read on night_checks for select
  using (profile_id = auth.uid() or app_level() >= 3 or (app_level() = 2 and home_id = app_home()));

-- Builds the checks for night shifts, opens the ones that are due, and flags the ones that were missed.
-- Runs every 5 minutes (pg_cron). Times are Vancouver time.
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

-- The staff member taps “Night check”. Only counts while a check is open and they are at the house.
create or replace function night_check_in(p_lat double precision, p_lng double precision, p_acc int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c night_checks; pl record;
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  select * into c from night_checks
  where profile_id = auth.uid() and status = 'Due' and window_until > now()
  order by due_at limit 1;
  if c.id is null then raise exception 'No night check is due right now.'; end if;
  if p_lat is null then raise exception 'Turn on your phone’s location, then tap again.'; end if;
  select * into pl from shift_place(c.home_id, p_lat, p_lng, p_acc);
  if pl.home_set and not coalesce(pl.on_site, false) then
    raise exception 'You are about % m from the house. Night checks are done at the house.', pl.distance_m;
  end if;
  update night_checks set status = 'Done', responded_at = now(), lat = p_lat, lng = p_lng,
    distance_m = pl.distance_m, on_site = pl.on_site
  where id = c.id;
  return jsonb_build_object('ok', true, 'kind', c.kind, 'distance_m', pl.distance_m, 'on_site', pl.on_site);
end $$;
grant execute on function night_check_in(double precision, double precision, int) to authenticated;

-- The staff member's open or next checks, for the phone screen.
create or replace function my_night_checks() returns setof night_checks
language sql stable security definer set search_path = public as $$
  select * from night_checks
  where profile_id = auth.uid() and status in ('Waiting', 'Due') and window_until > now()
  order by due_at limit 3;
$$;
grant execute on function my_night_checks() to authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('evergreen-night-checks') where exists (select 1 from cron.job where jobname = 'evergreen-night-checks');
  perform cron.schedule('evergreen-night-checks', '*/5 * * * *', 'select public.night_checks_tick()');
exception when others then
  raise notice 'Scheduler not available here (%).', sqlerrm;
end $$;
