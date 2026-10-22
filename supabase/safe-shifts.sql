-- =====================================================================
-- Evergreen CRM - Safe clock in / clock out, permission requests and the emergency button.
--  * Clock in and clock out only at the house (inside its zone; default 100 m). Away from the house →
--    "Ask permission": the Program Coordinator / Program Manager approves in the portal.
--  * "Before you leave" opens 30 minutes before the shift ends. Clock out needs: shift checklist signed,
--    a signed daily note for each person, and the safety lines answered (everyone accounted for, handover to
--    a named person, hurt or close call?, safe to get home). Anything missing → permission needed.
--  * Every check-out is saved with its answers; a reported injury alerts the leaders straight away.
--  * Emergency button: one tap alerts the house's Program Coordinator and Program Managers (and above) with location.
-- Uses app_level(), app_role(), app_home(), notify(), geo_distance_m(), house_leaders() (shift-checklists.sql).
-- Safe to run more than once.
-- =====================================================================

alter table homes add column if not exists on_call_phone text;
alter table homes alter column geofence_m set default 100;
update homes set geofence_m = 100 where geofence_m = 200;

alter table time_entries add column if not exists checkout     jsonb;
alter table time_entries add column if not exists checkout_ok  boolean;

-- ---------- Permission requests (clock in or out away from the house, early, or with things unfinished) ----------
create table if not exists shift_permission_requests (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles default auth.uid(),
  home_id        uuid references homes,
  time_entry_id  uuid references time_entries on delete set null,
  kind           text not null check (kind in ('Clock in', 'Clock out')),
  reasons        text[] not null default '{}',
  note           text not null,
  lat            double precision,
  lng            double precision,
  distance_m     int,
  status         text not null default 'Pending' check (status in ('Pending', 'Approved', 'Declined', 'Used')),
  decided_by     uuid references profiles,
  decided_at     timestamptz,
  decision_note  text,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists spr_pending on shift_permission_requests (status, created_at desc);
alter table shift_permission_requests enable row level security;
drop policy if exists spr_read on shift_permission_requests;
create policy spr_read on shift_permission_requests for select
  using (profile_id = auth.uid() or app_level() >= 3 or (app_level() = 2 and home_id = app_home()));

-- ---------- Emergency alerts ----------
create table if not exists emergency_alerts (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles default auth.uid(),
  home_id      uuid references homes,
  kind         text not null,
  note         text,
  lat          double precision,
  lng          double precision,
  distance_m   int,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references profiles,
  resolved_note text
);
create index if not exists emergency_open on emergency_alerts (created_at desc) where resolved_at is null;
alter table emergency_alerts enable row level security;
drop policy if exists ea_read on emergency_alerts;
create policy ea_read on emergency_alerts for select
  using (profile_id = auth.uid() or app_level() >= 3 or (app_level() = 2 and home_id = app_home()));

-- ---------- Where am I? (distance to the house, worked out on the server) ----------
create or replace function shift_place(p_home uuid, p_lat double precision, p_lng double precision, p_acc int,
  out home_set boolean, out distance_m int, out on_site boolean)
language plpgsql stable security definer set search_path = public as $$
declare h homes;
begin
  select * into h from homes where id = p_home;
  home_set := h.lat is not null and h.lng is not null;
  if not home_set or p_lat is null then distance_m := null; on_site := case when home_set then false else null end; return; end if;
  distance_m := round(geo_distance_m(p_lat, p_lng, h.lat, h.lng));
  on_site := distance_m <= coalesce(h.geofence_m, 100) + least(coalesce(p_acc, 0), 75);
end $$;
grant execute on function shift_place(uuid, double precision, double precision, int) to authenticated;

-- An approved, unused permission from the last 12 hours.
create or replace function my_permission(p_kind text) returns uuid language sql stable security definer set search_path = public as $$
  select id from shift_permission_requests
  where profile_id = auth.uid() and kind = p_kind and status = 'Approved' and created_at > now() - interval '12 hours'
  order by decided_at desc limit 1;
$$;
grant execute on function my_permission(text) to authenticated;

-- ---------- Ask permission ----------
create or replace function request_shift_permission(p_kind text, p_home uuid, p_reasons text[], p_note text,
  p_lat double precision default null, p_lng double precision default null, p_acc int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me profiles; hid uuid := p_home; te uuid; pl record; rid uuid; hname text;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null then raise exception 'Please sign in again.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Write the reason so your manager can decide.'; end if;
  select id, home_id into te, hid from time_entries where profile_id = auth.uid() and clock_out is null
    order by clock_in desc limit 1;
  hid := coalesce(hid, p_home, me.home_id);
  select * into pl from shift_place(hid, p_lat, p_lng, p_acc);
  -- One pending request at a time: update it instead of adding another.
  update shift_permission_requests set reasons = coalesce(p_reasons, '{}'), note = left(p_note, 500), lat = p_lat, lng = p_lng,
    distance_m = pl.distance_m, created_at = now()
  where profile_id = auth.uid() and kind = p_kind and status = 'Pending' returning id into rid;
  if rid is null then
    insert into shift_permission_requests (profile_id, home_id, time_entry_id, kind, reasons, note, lat, lng, distance_m)
    values (auth.uid(), hid, te, p_kind, coalesce(p_reasons, '{}'), left(p_note, 500), p_lat, p_lng, pl.distance_m)
    returning id into rid;
  end if;
  select name into hname from homes where id = hid;
  perform notify(l, '🙋 ' || me.full_name || ' asks permission to ' || lower(p_kind),
    coalesce(hname, 'No house') || ' · ' || coalesce(array_to_string(p_reasons, ', '), '') || ' — “' || left(p_note, 160) || '”',
    '/approvals', 'spr:' || rid || ':' || extract(epoch from now())::bigint || ':' || l)
  from house_leaders(hid) l where l <> auth.uid();
  return rid;
end $$;
grant execute on function request_shift_permission(text, uuid, text[], text, double precision, double precision, int) to authenticated;

create or replace function decide_shift_permission(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r shift_permission_requests; me profiles;
begin
  select * into r from shift_permission_requests where id = p_id;
  if r.id is null then raise exception 'Request not found.'; end if;
  if r.profile_id = auth.uid() then raise exception 'You can’t approve your own request.'; end if;
  if not (app_level() >= 3 or (app_level() = 2 and r.home_id = app_home())) then
    raise exception 'Only the house’s Program Coordinator or a Program Manager can decide this.';
  end if;
  if r.status <> 'Pending' then raise exception 'This request was already %.', lower(r.status); end if;
  select * into me from profiles where id = auth.uid();
  update shift_permission_requests set status = case when p_approve then 'Approved' else 'Declined' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 300) where id = p_id;
  perform notify(r.profile_id,
    case when p_approve then '✅ Approved: you can ' || lower(r.kind) || ' now' else '⛔ Not approved: ' || lower(r.kind) end,
    me.full_name || coalesce(' — ' || nullif(trim(p_note), ''), ''), '/id#checkin', 'sprd:' || p_id);
end $$;
grant execute on function decide_shift_permission(uuid, boolean, text) to authenticated;

-- ---------- Clock in (at the house) ----------
create or replace function clock_in_safely(p_home uuid, p_lat double precision, p_lng double precision, p_acc int, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pl record; perm uuid; te uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if p_home is null then raise exception 'Choose your house.'; end if;
  if exists (select 1 from time_entries where profile_id = auth.uid() and clock_out is null) then raise exception 'You are already clocked in.'; end if;
  select * into pl from shift_place(p_home, p_lat, p_lng, p_acc);
  if pl.home_set and not coalesce(pl.on_site, false) then
    perm := my_permission('Clock in');
    if perm is null then
      return jsonb_build_object('ok', false, 'need', 'Clock in', 'distance_m', pl.distance_m, 'no_location', p_lat is null);
    end if;
  end if;
  perform set_config('evg.safe_clock', '1', true);
  insert into time_entries (profile_id, home_id, notes) values (auth.uid(), p_home, left(p_note, 300)) returning id into te;
  insert into location_checkins (profile_id, time_entry_id, home_id, kind, lat, lng, accuracy_m, note)
  values (auth.uid(), te, p_home, 'Clock in', p_lat, p_lng, p_acc, left(p_note, 300));
  if perm is not null then update shift_permission_requests set status = 'Used', used_at = now(), time_entry_id = te where id = perm; end if;
  return jsonb_build_object('ok', true, 'entry', te, 'distance_m', pl.distance_m, 'on_site', pl.on_site, 'home_set', pl.home_set, 'approved', perm is not null);
end $$;
grant execute on function clock_in_safely(uuid, double precision, double precision, int, text) to authenticated;

-- ---------- What's still needed before I can leave? ----------
create or replace function clock_out_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare te time_entries; c shift_checklists; since timestamptz; opens timestamptz; total int; done int; missing_names text[];
  relief jsonb;
begin
  select * into te from time_entries where profile_id = auth.uid() and clock_out is null order by clock_in desc limit 1;
  if te.id is null then return jsonb_build_object('on_shift', false); end if;
  select * into c from shift_checklists where profile_id = auth.uid() and home_id = te.home_id and ends_at > now() - interval '12 hours'
    order by starts_at desc limit 1;
  since := coalesce(c.starts_at, te.clock_in) - interval '1 hour';
  opens := coalesce(c.ends_at, te.clock_in + interval '8 hours') - interval '30 minutes';
  select count(*) into total from residents r where r.home_id = te.home_id and r.status <> 'discharged';
  select array_agg(coalesce(r.preferred_name, r.first_name) order by r.first_name) into missing_names
  from residents r where r.home_id = te.home_id and r.status <> 'discharged'
    and not exists (select 1 from shift_notes n where n.resident_id = r.id and n.author_id = auth.uid() and n.signed_at is not null and n.created_at >= since);
  done := total - coalesce(array_length(missing_names, 1), 0);
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'since', t.clock_in) order by t.clock_in desc), '[]') into relief
  from time_entries t join profiles p on p.id = t.profile_id
  where t.home_id = te.home_id and t.clock_out is null and t.profile_id <> auth.uid();
  return jsonb_build_object(
    'on_shift', true, 'entry', te.id, 'home_id', te.home_id, 'clock_in', te.clock_in,
    'opens_at', opens, 'window_open', now() >= opens, 'ends_at', coalesce(c.ends_at, te.clock_in + interval '8 hours'),
    'checklist_id', c.id, 'checklist_signed', c.status = 'Signed', 'has_checklist', c.id is not null,
    'notes_total', total, 'notes_done', done, 'notes_missing', coalesce(to_jsonb(missing_names), '[]'),
    'relief', relief, 'permission', my_permission('Clock out') is not null,
    'pending', exists (select 1 from shift_permission_requests where profile_id = auth.uid() and kind = 'Clock out' and status = 'Pending'));
end $$;
grant execute on function clock_out_status() to authenticated;

-- ---------- Clock out (at the house, after the safety check) ----------
-- p_answers: { headcount: true, handover_to: "Name", handover_on_call: "Name (if nobody came)", hurt: "no"|"yes",
--              hurt_details: "...", safe_home: true }
create or replace function clock_out_safely(p_lat double precision, p_lng double precision, p_acc int, p_answers jsonb,
  p_break int default 0, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st jsonb; te time_entries; pl record; missing text[] := '{}'; perm uuid; me profiles; hname text; a jsonb := coalesce(p_answers, '{}');
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  st := clock_out_status();
  if not (st->>'on_shift')::boolean then raise exception 'You are not clocked in.'; end if;
  select * into te from time_entries where id = (st->>'entry')::uuid;
  -- The safety lines are always required (they take a few seconds and can't be approved away).
  if coalesce((a->>'headcount')::boolean, false) is not true then raise exception 'Tick “Everyone is accounted for” before you leave.'; end if;
  if coalesce(trim(a->>'handover_to'), '') = '' and coalesce(trim(a->>'handover_on_call'), '') = '' then
    raise exception 'Say who you handed over to (or which on-call person said you can leave).';
  end if;
  if coalesce(a->>'hurt', '') not in ('no', 'yes') then raise exception 'Answer “Were you hurt or did you have a close call this shift?”'; end if;
  if a->>'hurt' = 'yes' and coalesce(trim(a->>'hurt_details'), '') = '' then raise exception 'Say briefly what happened (injury or close call).'; end if;
  if coalesce((a->>'safe_home')::boolean, false) is not true then raise exception 'Confirm you can get home safely — or call on-call for help.'; end if;
  -- Things that need a manager's OK if they aren't done.
  select * into pl from shift_place(te.home_id, p_lat, p_lng, p_acc);
  if pl.home_set and not coalesce(pl.on_site, false) then missing := array_append(missing, case when p_lat is null then 'no location' else 'not at the house' end); end if;
  if not (st->>'window_open')::boolean then missing := array_append(missing, 'before the last 30 minutes of the shift'); end if;
  if (st->>'has_checklist')::boolean and not (st->>'checklist_signed')::boolean then missing := array_append(missing, 'shift checklist not signed'); end if;
  if (st->>'notes_done')::int < (st->>'notes_total')::int then missing := array_append(missing, 'daily notes not signed'); end if;
  if array_length(missing, 1) > 0 then
    perm := my_permission('Clock out');
    if perm is null then
      return jsonb_build_object('ok', false, 'need', 'Clock out', 'missing', to_jsonb(missing), 'distance_m', pl.distance_m);
    end if;
  end if;
  perform set_config('evg.safe_clock', '1', true);
  update time_entries set clock_out = now(), break_minutes = greatest(0, coalesce(p_break, 0)),
    notes = coalesce(nullif(trim(p_note), ''), notes),
    checkout = a || jsonb_build_object('missing', to_jsonb(missing), 'permission', perm, 'distance_m', pl.distance_m, 'at', now()),
    checkout_ok = array_length(missing, 1) is null
  where id = te.id;
  insert into location_checkins (profile_id, time_entry_id, home_id, kind, lat, lng, accuracy_m, note)
  values (auth.uid(), te.id, te.home_id, 'Clock out', p_lat, p_lng, p_acc, left(p_note, 300));
  if perm is not null then update shift_permission_requests set status = 'Used', used_at = now(), time_entry_id = te.id where id = perm; end if;
  if a->>'hurt' = 'yes' then
    select * into me from profiles where id = auth.uid();
    select name into hname from homes where id = te.home_id;
    perform notify(l, '🩹 ' || me.full_name || ' reported an injury or close call', coalesce(hname, '') || ': ' || left(a->>'hurt_details', 200)
      || ' — check on them and complete the WorkSafeBC steps.', '/checkins', 'hurt:' || te.id || ':' || l)
    from house_leaders(te.home_id) l;
  end if;
  return jsonb_build_object('ok', true, 'clean', array_length(missing, 1) is null, 'missing', to_jsonb(missing));
end $$;
grant execute on function clock_out_safely(double precision, double precision, int, jsonb, int, text) to authenticated;

-- ---------- Guard: clock in / clock out only through the safe functions (managers can still fix timesheets) ----------
create or replace function time_entries_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare ok boolean := coalesce(current_setting('evg.safe_clock', true), '') = '1' or auth.uid() is null
  or coalesce(app_role()::text, '') in ('admin', 'manager');
begin
  if tg_op = 'INSERT' and new.clock_out is null and not ok then
    raise exception 'Please clock in from your ID card page — it checks you are at the house.';
  end if;
  if tg_op = 'UPDATE' and old.clock_out is null and new.clock_out is not null and not ok then
    raise exception 'Please clock out from your ID card page — it runs the safety check before you leave.';
  end if;
  return new;
end $$;
drop trigger if exists time_entries_guard on time_entries;
create trigger time_entries_guard before insert or update on time_entries for each row execute function time_entries_guard();

-- ---------- Emergency button ----------
create or replace function raise_emergency(p_kind text, p_note text default null,
  p_lat double precision default null, p_lng double precision default null, p_acc int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me profiles; hid uuid; pl record; eid uuid; hname text; mapl text;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null then raise exception 'Please sign in again.'; end if;
  select home_id into hid from time_entries where profile_id = auth.uid() and clock_out is null order by clock_in desc limit 1;
  hid := coalesce(hid, me.home_id);
  select * into pl from shift_place(hid, p_lat, p_lng, p_acc);
  insert into emergency_alerts (profile_id, home_id, kind, note, lat, lng, distance_m)
  values (auth.uid(), hid, left(coalesce(p_kind, 'Emergency'), 60), left(p_note, 500), p_lat, p_lng, pl.distance_m) returning id into eid;
  select name into hname from homes where id = hid;
  mapl := case when p_lat is not null then ' · map: https://maps.google.com/?q=' || p_lat || ',' || p_lng else '' end;
  perform notify(l, '🆘 EMERGENCY: ' || p_kind || ' — ' || coalesce(hname, 'no house'),
    me.full_name || ' needs help now' || coalesce(': ' || nullif(trim(p_note), ''), '') || mapl, '/approvals#emergencies', 'sos:' || eid || ':' || l)
  from (select l from house_leaders(hid) l
        union select id from profiles where active and staff_group is null and coalesce(level, 0) >= 4
        union select id from profiles where active and role = 'admin') x(l)
  where l <> auth.uid();
  return eid;
end $$;
grant execute on function raise_emergency(text, text, double precision, double precision, int) to authenticated;

create or replace function resolve_emergency(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e emergency_alerts;
begin
  select * into e from emergency_alerts where id = p_id;
  if e.id is null then raise exception 'Alert not found.'; end if;
  if not (e.profile_id = auth.uid() or app_level() >= 3 or (app_level() = 2 and e.home_id = app_home())) then
    raise exception 'Only the person who raised it or a leader can close this alert.';
  end if;
  update emergency_alerts set resolved_at = now(), resolved_by = auth.uid(), resolved_note = left(p_note, 300) where id = p_id and resolved_at is null;
end $$;
grant execute on function resolve_emergency(uuid, text) to authenticated;

select 'safe shifts ready' as result,
  (select count(*) from homes where lat is not null) as houses_with_location,
  (select count(*) from homes) as houses;
