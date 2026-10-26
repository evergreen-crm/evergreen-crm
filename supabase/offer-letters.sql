-- =====================================================================
-- Evergreen CRM - Offer letters: created automatically, signed electronically, kept as one document.
--  * HR / Program Manager+ fills in the terms (or uploads their own PDF) -> Draft.
--  * "Send to sign": Evergreen's signature is added automatically (the sender's name, title, date/time)
--    and the person gets a portal notification.
--  * The person accepts in the portal: their saved onboarding signature is applied automatically,
--    plus their typed name, date/time, IP address and device. A fingerprint (SHA-256) of the terms is stored,
--    and the "Offer letter and acceptance" onboarding item is ticked automatically.
--  * After sending, the terms are locked. Safe to run more than once.
-- Uses app_level(), app_group() (access-levels.sql / staff-groups.sql) and notify() (policies-hr.sql).
-- =====================================================================

create table if not exists offer_letters (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references profiles(id) on delete cascade,
  status           text not null default 'Draft' check (status in ('Draft','Sent','Accepted','Declined','Withdrawn')),
  position         text not null,
  program          text,
  employment_type  text,
  wage             numeric,
  wage_unit        text not null default 'hour' check (wage_unit in ('hour','year')),
  hours            text,
  start_date       date,
  house            text,
  reports_to       text,
  respond_by       date,
  extra_terms      text,
  file_path        text,          -- optional: HR's own PDF/Word offer letter in the staff-files bucket
  file_name        text,
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  issued_by        uuid references profiles(id),
  issued_by_name   text,
  issued_by_title  text,
  issued_at        timestamptz,
  accepted_at      timestamptz,
  signed_name      text,
  signature_image  text,
  signer_ip        text,
  signer_agent     text,
  doc_hash         text,
  declined_at      timestamptz,
  decline_reason   text,
  withdrawn_at     timestamptz
);
create index if not exists offer_letters_profile on offer_letters (profile_id, created_at desc);

alter table offer_letters enable row level security;
drop policy if exists offers_read on offer_letters;
drop policy if exists offers_write on offer_letters;
create policy offers_read on offer_letters for select
  using (profile_id = auth.uid() or app_level() >= 3 or app_group() = 'hr');
-- HR and Program Manager+ manage offers, but never their own.
create policy offers_write on offer_letters for all
  using ((app_level() >= 3 or app_group() = 'hr') and profile_id <> auth.uid())
  with check ((app_level() >= 3 or app_group() = 'hr') and profile_id <> auth.uid());

-- Lock the terms once the offer is sent; Accepted/Declined only through the functions below.
create or replace function offer_letters_lock() returns trigger language plpgsql as $$
begin
  if old.status <> 'Draft' and (
       new.position is distinct from old.position or new.program is distinct from old.program
    or new.employment_type is distinct from old.employment_type or new.wage is distinct from old.wage
    or new.wage_unit is distinct from old.wage_unit or new.hours is distinct from old.hours
    or new.start_date is distinct from old.start_date or new.house is distinct from old.house
    or new.reports_to is distinct from old.reports_to or new.respond_by is distinct from old.respond_by
    or new.extra_terms is distinct from old.extra_terms or new.file_path is distinct from old.file_path
    or new.issued_by is distinct from old.issued_by or new.issued_at is distinct from old.issued_at) then
    raise exception 'This offer has been sent, so its terms are locked. Withdraw it and create a new one to change anything.';
  end if;
  if new.status in ('Accepted','Declined') and old.status is distinct from new.status
     and coalesce(current_setting('evg.offer_sign', true), '') <> '1' then
    raise exception 'Only the person receiving the offer can accept or decline it.';
  end if;
  if old.status = 'Sent' and new.status not in ('Sent','Withdrawn','Accepted','Declined') then
    raise exception 'A sent offer can only be withdrawn, accepted or declined.';
  end if;
  if old.status = 'Draft' and new.status = 'Sent' and new.issued_at is null then
    raise exception 'Use "Send to sign" so Evergreen''s signature is added.';
  end if;
  if old.status in ('Accepted','Declined','Withdrawn') and new.status is distinct from old.status then
    raise exception 'This offer is already %.', lower(old.status);
  end if;
  return new;
end $$;
drop trigger if exists offer_letters_lock on offer_letters;
create trigger offer_letters_lock before update on offer_letters for each row execute function offer_letters_lock();

-- Send to sign: Evergreen's signature is applied automatically from the sender's account.
create or replace function send_offer(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o offer_letters; me profiles; t text;
begin
  select * into o from offer_letters where id = p_id;
  if o.id is null then raise exception 'Offer not found.'; end if;
  if not (app_level() >= 3 or app_group() = 'hr') or o.profile_id = auth.uid() then
    raise exception 'Only HR or a Program Manager and above can send an offer (and not their own).';
  end if;
  if o.status <> 'Draft' then raise exception 'Only a draft can be sent.'; end if;
  if o.file_path is null and (o.wage is null or o.start_date is null) then
    raise exception 'Add the wage and start date (or upload your own offer letter) before sending.';
  end if;
  select * into me from profiles where id = auth.uid();
  t := case when me.role = 'admin' then 'Administrator'
            when me.staff_group = 'hr' then 'Human Resources'
            else case coalesce(me.level, 3) when 3 then 'Program Manager' when 4 then 'Director of Operations'
                 when 5 then 'Executive Director' when 6 then 'Chief Strategy Officer' when 7 then 'Chief Executive Officer'
                 else 'Manager' end end;
  update offer_letters set status = 'Sent', issued_by = me.id, issued_by_name = me.full_name, issued_by_title = t, issued_at = now()
  where id = p_id;
  perform notify(o.profile_id, 'Your offer letter is ready to sign',
    'Evergreen Community Care has sent you an offer of employment as ' || o.position || '. Please read and sign it.',
    '/offer/' || p_id, 'offer:' || p_id);
end $$;
grant execute on function send_offer(uuid) to authenticated;

-- The person accepts: saved signature applied automatically, plus typed name, time, IP, device and a fingerprint of the terms.
create or replace function accept_offer(p_id uuid, p_name text, p_ip text default null, p_agent text default null) returns text
language plpgsql security definer set search_path = public as $$
declare o offer_letters; me profiles; sig text; h text;
  norm text := lower(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]+', ' ', 'g'));
begin
  select * into o from offer_letters where id = p_id;
  if o.id is null or o.profile_id <> auth.uid() then raise exception 'This is not your offer letter.'; end if;
  if o.status <> 'Sent' then raise exception 'This offer is %; it can no longer be accepted.', lower(o.status); end if;
  if o.respond_by is not null and o.respond_by < (now() at time zone 'Etc/GMT+7')::date then
    raise exception 'This offer expired on %. Please contact HR.', o.respond_by;
  end if;
  select * into me from profiles where id = auth.uid();
  if trim(norm) <> trim(lower(regexp_replace(me.full_name, '[^A-Za-z]+', ' ', 'g'))) then
    raise exception 'To sign, type your full name exactly as it is on your account: "%".', me.full_name;
  end if;
  select signature_image into sig from onboardings where profile_id = auth.uid();
  h := encode(sha256(convert_to(jsonb_build_object(
         'id', o.id, 'person', me.full_name, 'position', o.position, 'program', o.program, 'type', o.employment_type,
         'wage', o.wage, 'unit', o.wage_unit, 'hours', o.hours, 'start', o.start_date, 'house', o.house,
         'reports_to', o.reports_to, 'extra', o.extra_terms, 'file', o.file_path,
         'issued_by', o.issued_by_name, 'issued_at', o.issued_at)::text, 'UTF8')), 'hex');
  perform set_config('evg.offer_sign', '1', true);
  update offer_letters set status = 'Accepted', accepted_at = now(), signed_name = trim(p_name), signature_image = sig,
    signer_ip = left(p_ip, 64), signer_agent = left(p_agent, 300), doc_hash = h
  where id = p_id;
  -- Tick "Offer letter and acceptance" in onboarding.
  update onboarding_items set status = 'Verified', signed_name = trim(p_name), signed_at = now(),
    data = coalesce(data, '{}'::jsonb) || jsonb_build_object('offer_id', p_id, 'doc_hash', h)
  where profile_id = auth.uid() and item_key = 'offer';
  -- Fill the HR file from the accepted offer (only blanks).
  update staff_details set position = coalesce(position, o.position),
    employment_type = coalesce(employment_type, case when o.employment_type in ('Full-time','Part-time','Casual') then o.employment_type end),
    hire_date = coalesce(hire_date, o.start_date)
  where profile_id = auth.uid();
  perform notify(o.issued_by, me.full_name || ' accepted the offer', o.position || ' — signed ' || to_char(now() at time zone 'Etc/GMT+7', 'Mon DD, YYYY HH24:MI'),
    '/offer/' || p_id, 'offer-acc:' || p_id);
  return h;
end $$;
grant execute on function accept_offer(uuid, text, text, text) to authenticated;

create or replace function decline_offer(p_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o offer_letters; me profiles;
begin
  select * into o from offer_letters where id = p_id;
  if o.id is null or o.profile_id <> auth.uid() then raise exception 'This is not your offer letter.'; end if;
  if o.status <> 'Sent' then raise exception 'This offer is %.', lower(o.status); end if;
  select * into me from profiles where id = auth.uid();
  perform set_config('evg.offer_sign', '1', true);
  update offer_letters set status = 'Declined', declined_at = now(), decline_reason = left(p_reason, 1000) where id = p_id;
  perform notify(o.issued_by, me.full_name || ' declined the offer', coalesce(p_reason, 'No reason given'), '/offer/' || p_id, 'offer-dec:' || p_id);
end $$;
grant execute on function decline_offer(uuid, text) to authenticated;

select 'offer_letters ready' as result, count(*) as offers from offer_letters;
