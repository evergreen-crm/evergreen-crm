-- =====================================================================
-- Evergreen CRM - Digital staff ID cards, house locations and shift check-ins.
-- Location is only recorded when a staff member taps Clock in / Check in / Clock out
-- during a shift. It is never tracked in the background. Safe to run again.
-- =====================================================================

-- ---------- Digital ID cards ----------
create table if not exists id_cards (
  profile_id       uuid primary key references profiles on delete cascade,
  photo_path       text,
  photo_status     text not null default 'None' check (photo_status in ('None','Pending','Approved','Returned')),
  photo_note       text,
  issued_on        date,
  expires_on       date,
  token            uuid not null unique default gen_random_uuid(),   -- what the QR code points to
  location_ack_at  timestamptz,                                       -- staff read the location notice
  updated_at       timestamptz not null default now()
);
alter table id_cards enable row level security;
drop policy if exists "id cards see" on id_cards;
drop policy if exists "id cards manage" on id_cards;
create policy "id cards see" on id_cards for select using (app_role() in ('admin','manager') or profile_id = auth.uid());
create policy "id cards manage" on id_cards for all using (app_role() in ('admin','manager')) with check (app_role() in ('admin','manager'));

-- Staff send their own photo for approval (they can't approve or issue their own card).
create or replace function submit_id_photo(path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or split_part(path, '/', 1) <> auth.uid()::text then raise exception 'Not your photo folder.'; end if;
  insert into id_cards (profile_id, photo_path, photo_status) values (auth.uid(), path, 'Pending')
  on conflict (profile_id) do update set photo_path = excluded.photo_path, photo_status = 'Pending', photo_note = null, updated_at = now();
end $$;
revoke execute on function submit_id_photo(text) from public;
grant execute on function submit_id_photo(text) to authenticated;

create or replace function ack_location_notice() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into id_cards (profile_id, location_ack_at) values (auth.uid(), now())
  on conflict (profile_id) do update set location_ack_at = coalesce(id_cards.location_ack_at, now());
end $$;
revoke execute on function ack_location_notice() from public;
grant execute on function ack_location_notice() to authenticated;

create or replace function id_card_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select full_name into who from profiles where id = new.profile_id;
  if new.photo_status is distinct from coalesce(old.photo_status, 'None') then
    if new.photo_status = 'Pending' then
      perform notify_managers(who || ' sent an ID card photo to approve', null, '/hr/' || new.profile_id || '#id-card', 'idp:' || new.profile_id || ':' || new.photo_path);
    elsif new.photo_status = 'Approved' then
      perform notify(new.profile_id, 'Your ID card photo was approved', null, '/id', 'idpa:' || new.photo_path);
    elsif new.photo_status = 'Returned' then
      perform notify(new.profile_id, 'Please send a new ID card photo', new.photo_note, '/id', 'idpr:' || new.photo_path);
    end if;
  end if;
  if new.issued_on is not null and new.issued_on is distinct from old.issued_on then
    perform notify(new.profile_id, 'Your digital ID card is ready', 'Valid until ' || new.expires_on, '/id', 'idi:' || new.profile_id || ':' || new.issued_on);
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists id_card_notify on id_cards;
create trigger id_card_notify before insert or update on id_cards for each row execute function id_card_notify();
drop trigger if exists audit_id_cards on id_cards;
create trigger audit_id_cards after insert or update or delete on id_cards for each row execute function write_audit();

-- Public check when someone scans the QR code. Gives only what is printed on the card.
create or replace function verify_id_card(t uuid)
returns table (full_name text, job_title text, employee_no text, program text, house text,
               photo_path text, issued_on date, expires_on date, status text)
language sql stable security definer set search_path = public as $$
  select p.full_name, sd.position, sd.employee_no, coalesce(sd.program, 'Both'), h.name,
         case when c.photo_status = 'Approved' then c.photo_path end, c.issued_on, c.expires_on,
         case
           when not p.active or coalesce(sd.employment_status, 'Active') <> 'Active' then 'Not active'
           when c.issued_on is null or c.photo_status <> 'Approved' then 'Not issued'
           when c.expires_on < current_date then 'Expired'
           else 'Valid' end
  from id_cards c join profiles p on p.id = c.profile_id
  left join staff_details sd on sd.profile_id = c.profile_id
  left join homes h on h.id = p.home_id
  where c.token = t;
$$;
revoke execute on function verify_id_card(uuid) from public;
grant execute on function verify_id_card(uuid) to anon, authenticated;

-- Photo storage: staff upload to their own folder; approved photos can be shown on the verify page.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('id-photos', 'id-photos', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;
drop policy if exists "id photos read" on storage.objects;
drop policy if exists "id photos verify" on storage.objects;
drop policy if exists "id photos upload" on storage.objects;
drop policy if exists "id photos delete" on storage.objects;
create policy "id photos read" on storage.objects for select to authenticated using (
  bucket_id = 'id-photos' and (app_role() in ('admin','manager') or (storage.foldername(name))[1] = auth.uid()::text));
create policy "id photos verify" on storage.objects for select to anon, authenticated using (
  bucket_id = 'id-photos' and exists (select 1 from public.id_cards c where c.photo_path = name and c.photo_status = 'Approved'));
create policy "id photos upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'id-photos' and (app_role() in ('admin','manager') or (storage.foldername(name))[1] = auth.uid()::text));
create policy "id photos delete" on storage.objects for delete to authenticated using (
  bucket_id = 'id-photos' and app_role() in ('admin','manager'));

-- ---------- House locations ----------
alter table homes add column if not exists lat double precision;
alter table homes add column if not exists lng double precision;
alter table homes add column if not exists geofence_m int not null default 200;   -- how close counts as "at the house"

create or replace function geo_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- ---------- Shift check-ins ----------
create table if not exists location_checkins (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles on delete cascade default auth.uid(),
  time_entry_id  uuid references time_entries on delete set null,
  home_id        uuid references homes,
  kind           text not null default 'Check-in' check (kind in ('Clock in','Check-in','Clock out')),
  lat            double precision,
  lng            double precision,
  accuracy_m     int,
  distance_m     int,
  on_site        boolean,
  note           text,
  at             timestamptz not null default now()
);
create index if not exists location_checkins_entry on location_checkins (time_entry_id, at desc);
create index if not exists location_checkins_at on location_checkins (at desc);
alter table location_checkins enable row level security;
drop policy if exists "checkins see" on location_checkins;
drop policy if exists "checkins add" on location_checkins;
drop policy if exists "checkins delete" on location_checkins;
create policy "checkins see" on location_checkins for select using (app_role() in ('admin','manager') or profile_id = auth.uid());
create policy "checkins add" on location_checkins for insert with check (profile_id = auth.uid() and app_role() in ('admin','manager','staff'));
create policy "checkins delete" on location_checkins for delete using (app_role() = 'admin');

-- Time is always the server's; distance to the house is worked out here, not in the phone.
create or replace function checkin_fill() returns trigger language plpgsql security definer set search_path = public as $$
declare h record;
begin
  new.at := now();
  if new.home_id is null and new.time_entry_id is not null then
    select home_id into new.home_id from time_entries where id = new.time_entry_id;
  end if;
  if new.home_id is null then select home_id into new.home_id from profiles where id = new.profile_id; end if;
  select lat, lng, geofence_m into h from homes where id = new.home_id;
  if new.lat is not null and h.lat is not null then
    new.distance_m := round(geo_distance_m(new.lat, new.lng, h.lat, h.lng));
    new.on_site := new.distance_m <= h.geofence_m + least(coalesce(new.accuracy_m, 0), 150);
  end if;
  return new;
end $$;
drop trigger if exists checkin_fill on location_checkins;
create trigger checkin_fill before insert on location_checkins for each row execute function checkin_fill();

-- ---------- Reminders: check in every 3 hours while on shift; card expiry ----------
create or replace function checkin_reminders() returns void language plpgsql security definer set search_path = public as $$
declare r record; gap interval := interval '3 hours';
begin
  for r in
    select t.id, t.profile_id, p.full_name,
           greatest(t.clock_in, coalesce((select max(c.at) from location_checkins c where c.time_entry_id = t.id), t.clock_in)) as last_at
    from time_entries t join profiles p on p.id = t.profile_id
    where t.clock_out is null and t.clock_in > now() - interval '24 hours' and p.active
  loop
    if now() - r.last_at >= gap then
      perform notify(r.profile_id, 'Time to check in', 'Open your ID card and tap Check in.', '/id',
        'chk:' || r.id || ':' || floor(extract(epoch from r.last_at)));
    end if;
    if now() - r.last_at >= gap + interval '1 hour' then
      perform notify_managers(r.full_name || ' has not checked in for ' || floor(extract(epoch from now() - r.last_at) / 3600) || ' hours',
        null, '/checkins', 'chkm:' || r.id || ':' || floor(extract(epoch from r.last_at)));
    end if;
  end loop;

  for r in
    select c.profile_id, c.expires_on, p.full_name from id_cards c join profiles p on p.id = c.profile_id
    where p.active and c.expires_on is not null and c.expires_on <= current_date + 30
  loop
    perform notify(r.profile_id, 'Your ID card ' || case when r.expires_on < current_date then 'has expired' else 'expires ' || r.expires_on end,
      'Ask your manager to renew it.', '/id', 'idx:' || r.profile_id || ':' || r.expires_on);
    perform notify_managers(r.full_name || '''s ID card ' || case when r.expires_on < current_date then 'has expired' else 'expires ' || r.expires_on end,
      null, '/hr/' || r.profile_id || '#id-card', 'idx:' || r.profile_id || ':' || r.expires_on);
  end loop;
end $$;
revoke execute on function checkin_reminders() from public, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('evergreen-checkin-reminders') where exists (select 1 from cron.job where jobname = 'evergreen-checkin-reminders');
  perform cron.schedule('evergreen-checkin-reminders', '*/30 * * * *', 'select public.checkin_reminders()');
exception when others then
  raise notice 'Scheduler not available here (%).', sqlerrm;
end $$;
