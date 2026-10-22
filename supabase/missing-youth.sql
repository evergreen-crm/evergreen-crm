-- 🔎 Missing youth or adult — a timed log from minute one.
-- Follows MCFD's "When a child or youth in care is missing" (Oct 2023) and the Evergreen Staff Rules Handbook §11:
--   search 30 minutes at most (a maximum, not a waiting period) · Program Manager told within 30 minutes ·
--   police if there's no direction after 1 hour (right away if higher risk) · Executive Director told after 2 hours ·
--   critical incident report within 24 hours · warm welcome back, injury check, return interview / debrief.
-- Safe to run more than once.

create table if not exists missing_episodes (
  id               uuid primary key default gen_random_uuid(),
  resident_id      uuid not null references residents on delete cascade,
  home_id          uuid not null references homes,
  status           text not null default 'Missing' check (status in ('Missing', 'Found', 'Closed')),
  started_at       timestamptz not null default now(),
  started_by       uuid references profiles default auth.uid(),
  last_seen_at     timestamptz,
  last_seen_where  text,
  last_seen_with   text,
  clothing         text,
  higher_risk      boolean not null default false,
  risk_notes       text,
  police_called_at timestamptz,
  police_file      text,
  worker_told_at   timestamptz,
  worker_told_who  text,
  pm_told_at       timestamptz,
  ed_told_at       timestamptz,
  found_at         timestamptz,
  found_where      text,
  return_notes     text,
  debrief_notes    text,
  closed_at        timestamptz,
  closed_by        uuid references profiles,
  incident_id      uuid references incidents on delete set null,
  escalated        text[] not null default '{}',    -- which timed alerts have gone out: 30, 60, 120
  created_at       timestamptz not null default now()
);
create unique index if not exists missing_one_open on missing_episodes (resident_id) where status = 'Missing';
create index if not exists missing_open on missing_episodes (started_at) where status <> 'Closed';

create table if not exists missing_log (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references missing_episodes on delete cascade,
  at          timestamptz not null default now(),
  step        text not null,
  note        text,
  by          uuid references profiles default auth.uid()
);
create index if not exists missing_log_ep on missing_log (episode_id, at);

alter table missing_episodes enable row level security;
alter table missing_log enable row level security;

drop policy if exists "missing see" on missing_episodes;
create policy "missing see" on missing_episodes for select using (
  app_role() in ('admin', 'manager') or (app_role() = 'staff' and home_id = app_home())
);
drop policy if exists "missing log see" on missing_log;
create policy "missing log see" on missing_log for select using (
  exists (select 1 from missing_episodes e where e.id = episode_id
          and (app_role() in ('admin', 'manager') or (app_role() = 'staff' and e.home_id = app_home())))
);
-- All changes go through the functions below (so every step is logged with time and person).

do $$ begin
  create trigger audit_missing_episodes after insert or update or delete on missing_episodes
    for each row execute function write_audit();
exception when duplicate_object then null; when undefined_function then null;
end $$;

-- Missing alerts are urgent (emailed right away): dedupe keys starting with miss…
create or replace function notification_urgency() returns trigger language plpgsql as $$
begin
  new.urgent := new.urgent
    or new.title like '🆘%' or new.title like '🩹%' or new.title like '⚠️ Safety%' or new.title like '🙋%'
    or new.title like '✅ Approved%' or new.title like '⛔%' or new.title like '❓%' or new.title like '💬%'
    or new.title like '🔎%'
    or coalesce(new.dedupe_key, '') ~ '^(sos|spr|sprd|help|helpa|miss|miss30|miss60|miss120|missf):';
  return new;
end $$;

-- Who may act on an episode: staff of that house, managers, admins.
create or replace function missing_can(p_home uuid) returns boolean language sql stable security definer set search_path = public as $$
  select app_role() in ('admin', 'manager') or (app_role() = 'staff' and p_home = app_home());
$$;

create or replace function missing_name(p_res uuid) returns text language sql stable security definer set search_path = public as $$
  select concat_ws(' ', coalesce(nullif(preferred_name, ''), first_name), nullif(left(coalesce(last_name, ''), 1), '') || '.') from residents where id = p_res;
$$;

-- Tell the house leaders (Program Coordinator + Program Manager), the person who started it, and the levels listed
-- (4 = Director of Operations, 5 = Executive Director).
create or replace function missing_alert(e missing_episodes, p_title text, p_body text, p_key text, p_levels int[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  for pid in
    select x from house_leaders(e.home_id) x
    union select id from profiles where active and staff_group is null and level = any (p_levels)
    union select e.started_by where e.started_by is not null
  loop
    perform notify(pid, p_title, p_body, '/missing/' || e.id, p_key || ':' || e.id || ':' || pid);
  end loop;
end $$;

-- ▶ Start: called by the 🔎 Report missing button.
create or replace function start_missing(p_resident uuid, p_last_seen_at timestamptz, p_where text, p_with text,
  p_clothing text, p_higher_risk boolean, p_risk_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r residents; e missing_episodes; inc uuid; who text;
begin
  select * into r from residents where id = p_resident;
  if r.id is null then raise exception 'That person wasn’t found.'; end if;
  if not missing_can(r.home_id) then raise exception 'You can only report someone missing from your own house.'; end if;
  if exists (select 1 from missing_episodes where resident_id = p_resident and status = 'Missing') then
    raise exception 'They are already reported missing. Open the missing log instead.';
  end if;
  select full_name into who from profiles where id = auth.uid();

  insert into incidents (resident_id, home_id, occurred_on, occurred_time, incident_type, is_critical, is_urgent, description, actions_taken)
  values (p_resident, r.home_id, (coalesce(p_last_seen_at, now()) at time zone 'America/Vancouver')::date,
          (coalesce(p_last_seen_at, now()) at time zone 'America/Vancouver')::time,
          'Unauthorized absence / missing', true, true,
          'Reported missing by ' || coalesce(who, 'staff') || '. Last seen ' || coalesce(p_where, '(place not given)')
            || coalesce(' with ' || nullif(p_with, ''), '') || '. Wearing: ' || coalesce(nullif(p_clothing, ''), '(not given)') || '.',
          'Missing log started in the CRM. See the missing log for every step and time.')
  returning id into inc;

  insert into missing_episodes (resident_id, home_id, last_seen_at, last_seen_where, last_seen_with, clothing, higher_risk, risk_notes, incident_id)
  values (p_resident, r.home_id, p_last_seen_at, nullif(p_where, ''), nullif(p_with, ''), nullif(p_clothing, ''),
          coalesce(p_higher_risk, false), nullif(p_risk_notes, ''), inc)
  returning * into e;
  insert into missing_log (episode_id, step, note) values (e.id, 'started',
    case when e.higher_risk then 'Higher risk: ' || coalesce(e.risk_notes, 'yes') else null end);

  perform missing_alert(e, '🔎 MISSING: ' || missing_name(p_resident),
    'Reported by ' || coalesce(who, 'staff') || '. ' ||
    case when e.higher_risk then 'HIGHER RISK — call police now. ' else '' end ||
    'Program Manager: confirm you have been told, and give direction.', 'miss');
  return e.id;
end $$;

-- ✓ A step in the search. Some steps also fill in the episode (police file, who was told…).
create or replace function missing_step(p_episode uuid, p_step text, p_note text default null, p_extra text default null)
returns void language plpgsql security definer set search_path = public as $$
declare e missing_episodes;
begin
  select * into e from missing_episodes where id = p_episode;
  if e.id is null or not missing_can(e.home_id) then raise exception 'Not allowed.'; end if;
  if e.status = 'Closed' then raise exception 'This missing log is closed.'; end if;
  if p_step not in ('searched_home', 'called_texted', 'social_media', 'friends_family', 'usual_places', 'hospital_school',
                    'police', 'photo_to_police', 'worker', 'pm', 'ed', 'sighting', 'note',
                    'welcomed', 'injury_check', 'worker_return', 'everyone_told', 'return_interview') then
    raise exception 'Unknown step.';
  end if;
  if p_step = 'police' then
    update missing_episodes set police_called_at = coalesce(police_called_at, now()), police_file = coalesce(nullif(p_extra, ''), police_file) where id = e.id;
  elsif p_step = 'worker' then
    update missing_episodes set worker_told_at = coalesce(worker_told_at, now()), worker_told_who = coalesce(nullif(p_extra, ''), worker_told_who) where id = e.id;
  elsif p_step = 'pm' then
    update missing_episodes set pm_told_at = coalesce(pm_told_at, now()) where id = e.id;
  elsif p_step = 'ed' then
    update missing_episodes set ed_told_at = coalesce(ed_told_at, now()) where id = e.id;
  end if;
  insert into missing_log (episode_id, step, note) values (e.id, p_step,
    nullif(concat_ws(' · ', nullif(p_extra, ''), nullif(p_note, '')), ''));
end $$;

-- ✅ Found / back home.
create or replace function missing_found(p_episode uuid, p_where text, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
declare e missing_episodes; who text;
begin
  select * into e from missing_episodes where id = p_episode;
  if e.id is null or not missing_can(e.home_id) then raise exception 'Not allowed.'; end if;
  if e.status <> 'Missing' then raise exception 'Already marked as found.'; end if;
  update missing_episodes set status = 'Found', found_at = now(), found_where = nullif(p_where, ''), return_notes = nullif(p_notes, '')
   where id = e.id returning * into e;
  insert into missing_log (episode_id, step, note) values (e.id, 'found', nullif(concat_ws(' · ', nullif(p_where, ''), nullif(p_notes, '')), ''));
  select full_name into who from profiles where id = auth.uid();
  perform missing_alert(e, '🔎 FOUND: ' || missing_name(e.resident_id) || ' is back',
    'Marked found by ' || coalesce(who, 'staff') || '. Tell everyone who was told (police, social worker). Check for injuries and offer a return interview.',
    'missf', case when 'ed' = any (e.escalated) or e.ed_told_at is not null then array[4, 5] else '{}'::int[] end);
end $$;

-- 🗂 Close after the debrief (Program Coordinator and up).
create or replace function missing_close(p_episode uuid, p_debrief text)
returns void language plpgsql security definer set search_path = public as $$
declare e missing_episodes;
begin
  select * into e from missing_episodes where id = p_episode;
  if e.id is null or not missing_can(e.home_id) then raise exception 'Not allowed.'; end if;
  if app_level() < 2 then raise exception 'Only a Program Coordinator or Manager can close a missing log.'; end if;
  if e.status <> 'Found' then raise exception 'Mark them found first.'; end if;
  if length(trim(coalesce(p_debrief, ''))) < 10 then raise exception 'Write a short debrief: where they were, why they left, and the plan to prevent it.'; end if;
  update missing_episodes set status = 'Closed', closed_at = now(), closed_by = auth.uid(), debrief_notes = p_debrief where id = e.id;
  insert into missing_log (episode_id, step, note) values (e.id, 'closed', p_debrief);
end $$;

-- ⏱ Timed alerts (every 5 minutes): 30 min PM not confirmed · 1 h no police · 2 h Executive Director.
create or replace function missing_escalate() returns int language plpgsql security definer set search_path = public as $$
declare e missing_episodes; n int := 0; mins int;
begin
  for e in select * from missing_episodes where status = 'Missing' loop
    mins := extract(epoch from now() - e.started_at) / 60;
    if mins >= 30 and not ('30' = any (e.escalated)) then
      if e.pm_told_at is null then
        perform missing_alert(e, '🔎 30 min: ' || missing_name(e.resident_id) || ' still missing',
          'The Program Manager hasn’t confirmed being told. Program Manager: call the house now and give direction.', 'miss30', array[4]);
      end if;
      update missing_episodes set escalated = array_append(escalated, '30') where id = e.id; n := n + 1;
    end if;
    if mins >= 60 and not ('60' = any (e.escalated)) then
      if e.police_called_at is null then
        perform missing_alert(e, '🔎 1 hour: call police for ' || missing_name(e.resident_id),
          'Missing for 1 hour and no police call is logged. Unless you have other direction, call police now and log the file number.', 'miss60', array[4]);
      end if;
      update missing_episodes set escalated = array_append(escalated, '60') where id = e.id; n := n + 1;
    end if;
    if mins >= 120 and not ('120' = any (e.escalated)) then
      perform missing_alert(e, '🔎 2 hours: ' || missing_name(e.resident_id) || ' still missing',
        'Executive Director: you are being told because the person has been missing for over 2 hours.', 'miss120', array[4, 5]);
      update missing_episodes set escalated = escalated || array['120', 'ed']::text[] where id = e.id; n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function missing_alert(missing_episodes, text, text, text, int[]) from public, anon, authenticated;
revoke execute on function missing_escalate() from public, anon, authenticated;
revoke execute on function missing_can(uuid) from public, anon;
revoke execute on function missing_name(uuid) from public, anon;
grant execute on function start_missing(uuid, timestamptz, text, text, text, boolean, text) to authenticated;
grant execute on function missing_step(uuid, text, text, text) to authenticated;
grant execute on function missing_found(uuid, text, text) to authenticated;
grant execute on function missing_close(uuid, text) to authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('evergreen-missing') where exists (select 1 from cron.job where jobname = 'evergreen-missing');
  perform cron.schedule('evergreen-missing', '*/5 * * * *', 'select public.missing_escalate()');
exception when others then
  raise notice 'Scheduler not available here (%).', sqlerrm;
end $$;

select 'missing youth ready' as result;
