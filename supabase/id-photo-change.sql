-- =====================================================================
-- Evergreen CRM - Change ID card photo after the card is issued.
-- The new photo waits for approval; the current card keeps working until then.
-- Run after id-cards.sql. Safe to run again.
-- =====================================================================
alter table id_cards add column if not exists new_photo_path   text;
alter table id_cards add column if not exists new_photo_status text;
alter table id_cards add column if not exists new_photo_note   text;
alter table id_cards drop constraint if exists id_cards_new_photo_status_check;
alter table id_cards add constraint id_cards_new_photo_status_check check (new_photo_status in ('Pending','Returned'));

-- Staff send a photo. If they already have an approved photo, it is kept until the new one is approved.
create or replace function submit_id_photo(path text) returns void
language plpgsql security definer set search_path = public as $$
declare cur id_cards;
begin
  if auth.uid() is null or split_part(path, '/', 1) <> auth.uid()::text then raise exception 'Not your photo folder.'; end if;
  select * into cur from id_cards where profile_id = auth.uid();
  if cur.photo_status = 'Approved' then
    update id_cards set new_photo_path = path, new_photo_status = 'Pending', new_photo_note = null where profile_id = auth.uid();
  else
    insert into id_cards (profile_id, photo_path, photo_status) values (auth.uid(), path, 'Pending')
    on conflict (profile_id) do update set photo_path = excluded.photo_path, photo_status = 'Pending', photo_note = null;
  end if;
end $$;
revoke execute on function submit_id_photo(text) from public;
grant execute on function submit_id_photo(text) to authenticated;

create or replace function id_card_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select full_name into who from profiles where id = new.profile_id;
  if new.photo_status is distinct from coalesce(old.photo_status, 'None') or new.photo_path is distinct from old.photo_path then
    if new.photo_status = 'Pending' then
      perform notify_managers(who || ' sent an ID card photo to approve', null, '/hr/' || new.profile_id || '#id-card', 'idp:' || new.photo_path);
    elsif new.photo_status = 'Approved' then
      perform notify(new.profile_id, 'Your ID card photo was approved', null, '/id', 'idpa:' || new.photo_path);
    elsif new.photo_status = 'Returned' then
      perform notify(new.profile_id, 'Please send a new ID card photo', new.photo_note, '/id', 'idpr:' || new.photo_path);
    end if;
  end if;
  if new.new_photo_status is distinct from old.new_photo_status and new.new_photo_path is not null then
    if new.new_photo_status = 'Pending' then
      perform notify_managers(who || ' sent a new ID card photo to approve', 'Their current card keeps working until you approve it.', '/hr/' || new.profile_id || '#id-card', 'idp:' || new.new_photo_path);
    elsif new.new_photo_status = 'Returned' then
      perform notify(new.profile_id, 'Your new ID card photo was not approved', new.new_photo_note, '/id', 'idpr:' || new.new_photo_path);
    end if;
  end if;
  if new.issued_on is not null and new.issued_on is distinct from old.issued_on then
    perform notify(new.profile_id, 'Your digital ID card is ready', 'Valid until ' || new.expires_on, '/id', 'idi:' || new.profile_id || ':' || new.issued_on);
  end if;
  new.updated_at := now();
  return new;
end $$;
