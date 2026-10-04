-- =====================================================================
-- Evergreen CRM - Staff onboarding, e-signatures and training certificates
-- (MCFD Standard G.1 personnel file, G.3 training matrix). Safe to run again.
-- =====================================================================

create table if not exists onboardings (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null unique references profiles on delete cascade,
  status           text not null default 'Sent' check (status in ('Sent','In progress','Submitted','Complete')),
  hire_date        date,
  due_date         date,
  personal         jsonb not null default '{}'::jsonb,   -- contact, emergency contact, pronouns
  signature_image  text,                                 -- drawn signature (PNG data URL)
  signature_at     timestamptz,
  sent_by          uuid references profiles default auth.uid(),
  sent_at          timestamptz not null default now(),
  submitted_at     timestamptz,
  completed_by     uuid references profiles,
  completed_at     timestamptz
);

create table if not exists onboarding_items (
  id             uuid primary key default gen_random_uuid(),
  onboarding_id  uuid not null references onboardings on delete cascade,
  profile_id     uuid not null references profiles on delete cascade,
  section        text not null check (section in ('file','policy','training')),
  item_key       text not null,
  title          text not null,
  sort           int not null default 0,
  due_date       date,
  status         text not null default 'To do' check (status in ('To do','Submitted','Verified','Returned','N/A')),
  data           jsonb not null default '{}'::jsonb,
  file_path      text,
  signed_name    text,
  signed_at      timestamptz,
  review_note    text,
  reviewed_by    uuid references profiles,
  reviewed_at    timestamptz,
  training_id    uuid,
  unique (onboarding_id, item_key)
);

-- Certificates: extra details on training records
alter table trainings add column if not exists provider text;
alter table trainings add column if not exists expires_on date;
alter table trainings add column if not exists certificate_no text;
alter table trainings add column if not exists verified_by uuid references profiles;

alter table onboardings enable row level security;
alter table onboarding_items enable row level security;

drop policy if exists "onb see" on onboardings;
drop policy if exists "onb add" on onboardings;
drop policy if exists "onb edit" on onboardings;
drop policy if exists "onb delete" on onboardings;
create policy "onb see" on onboardings for select using (app_role() in ('admin','manager') or profile_id = auth.uid());
create policy "onb add" on onboardings for insert with check (app_role() in ('admin','manager'));
create policy "onb edit" on onboardings for update using (app_role() in ('admin','manager') or profile_id = auth.uid())
  with check (app_role() in ('admin','manager') or profile_id = auth.uid());
create policy "onb delete" on onboardings for delete using (app_role() = 'admin');

drop policy if exists "onb items see" on onboarding_items;
drop policy if exists "onb items add" on onboarding_items;
drop policy if exists "onb items edit" on onboarding_items;
drop policy if exists "onb items delete" on onboarding_items;
create policy "onb items see" on onboarding_items for select using (app_role() in ('admin','manager') or profile_id = auth.uid());
create policy "onb items add" on onboarding_items for insert with check (app_role() in ('admin','manager'));
create policy "onb items edit" on onboarding_items for update using (app_role() in ('admin','manager') or profile_id = auth.uid())
  with check (app_role() in ('admin','manager') or profile_id = auth.uid());
create policy "onb items delete" on onboarding_items for delete using (app_role() = 'admin');

-- Staff can fill in and sign their own items, but cannot verify, change titles or due dates,
-- or change an item once it is verified. Signing time is set by the database, not the browser.
create or replace function guard_onboarding_item() returns trigger language plpgsql as $$
declare boss boolean := app_role() in ('admin','manager');
begin
  if new.signed_name is distinct from old.signed_name then
    new.signed_at := case when new.signed_name is null then null else now() end;
  elsif new.signed_at is distinct from old.signed_at then
    new.signed_at := old.signed_at;
  end if;
  if not boss then
    if old.status in ('Verified','N/A') then raise exception 'This item has already been verified.'; end if;
    if new.status not in ('To do','Submitted') then raise exception 'Only a manager can verify items.'; end if;
    if new.section is distinct from old.section or new.item_key is distinct from old.item_key
       or new.title is distinct from old.title or new.due_date is distinct from old.due_date
       or new.profile_id is distinct from old.profile_id or new.onboarding_id is distinct from old.onboarding_id
       or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at
       or new.review_note is distinct from old.review_note or new.training_id is distinct from old.training_id then
      raise exception 'You can only fill in and sign your own items.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists onboarding_item_guard on onboarding_items;
create trigger onboarding_item_guard before update on onboarding_items for each row execute function guard_onboarding_item();

create or replace function guard_onboarding() returns trigger language plpgsql as $$
begin
  if new.signature_image is distinct from old.signature_image then new.signature_at := now();
  elsif new.signature_at is distinct from old.signature_at then new.signature_at := old.signature_at; end if;
  if app_role() not in ('admin','manager') then
    if new.status not in ('In progress','Submitted') and new.status is distinct from old.status then
      raise exception 'Only a manager can complete onboarding.'; end if;
    if old.status = 'Complete' then raise exception 'Onboarding is already complete.'; end if;
    if new.hire_date is distinct from old.hire_date or new.due_date is distinct from old.due_date
       or new.completed_by is distinct from old.completed_by or new.completed_at is distinct from old.completed_at
       or new.sent_by is distinct from old.sent_by or new.profile_id is distinct from old.profile_id then
      raise exception 'You can only fill in your own information.'; end if;
    if new.status = 'Submitted' and old.status <> 'Submitted' then new.submitted_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists onboarding_guard on onboardings;
create trigger onboarding_guard before update on onboardings for each row execute function guard_onboarding();

-- Private file storage for staff documents (CRC, résumé, certificates). Folder = the staff member's id.
insert into storage.buckets (id, name, public, file_size_limit)
values ('staff-files', 'staff-files', false, 26214400)
on conflict (id) do nothing;
drop policy if exists "staff files read" on storage.objects;
drop policy if exists "staff files upload" on storage.objects;
drop policy if exists "staff files delete" on storage.objects;
create policy "staff files read" on storage.objects for select to authenticated using (
  bucket_id = 'staff-files' and (app_role() in ('admin','manager') or (storage.foldername(name))[1] = auth.uid()::text));
create policy "staff files upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'staff-files' and (app_role() in ('admin','manager') or (storage.foldername(name))[1] = auth.uid()::text));
create policy "staff files delete" on storage.objects for delete to authenticated using (
  bucket_id = 'staff-files' and app_role() in ('admin','manager'));

drop trigger if exists audit_onboardings on onboardings;
drop trigger if exists audit_onboarding_items on onboarding_items;
create trigger audit_onboardings after insert or update or delete on onboardings for each row execute function write_audit();
create trigger audit_onboarding_items after insert or update or delete on onboarding_items for each row execute function write_audit();
