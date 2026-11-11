-- =====================================================================
-- Evergreen CRM - Uploaded offer letters, every version kept (Nov 11, 2026).
--   * Leaders can upload their own offer letter file for a person (PDF or Word) as well as, or instead of,
--     the automatic letter. Each upload is a new version (1, 2, 3 ...). Versions are never replaced or deleted.
--   * Who: the same people who set up the person's job - Program Coordinators (their own house), Program
--     Managers (their houses), directors, HR and the Administrator. The person does not see these files.
--   * Files live in the staff-files bucket at <person>/paperwork/offers/.
-- Needs auto-offer.sql. Run as migration offer_uploads. Safe to re-run.
-- =====================================================================

create table if not exists public.offer_uploads (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles on delete cascade,
  version     int not null,
  file_path   text not null unique,
  file_name   text not null,
  file_size   bigint,
  note        text,
  uploaded_by uuid references public.profiles,
  uploaded_at timestamptz not null default now(),
  unique (profile_id, version)
);
alter table public.offer_uploads enable row level security;

-- May this signed-in person handle offer letter files for p? (Never their own.)
create or replace function public.can_handle_offer_files(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p is not null and p <> auth.uid() and (
    can_manage_person(p)
    or (coalesce(app_level(), 0) = 2 and coalesce(app_group(), '') = '' and staff_in_my_houses(p)))
$$;

drop policy if exists "offer uploads see" on public.offer_uploads;
create policy "offer uploads see" on public.offer_uploads for select using (can_handle_offer_files(profile_id));

drop trigger if exists audit_offer_uploads on public.offer_uploads;
create trigger audit_offer_uploads after insert or update or delete on public.offer_uploads for each row execute function write_audit();

-- Record an uploaded file as the next version. The file must already be in the person's offers folder.
create or replace function public.add_offer_upload(p_profile uuid, p_path text, p_name text, p_size bigint default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v int; new_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if not can_handle_offer_files(p_profile) then raise exception 'You can only upload offer letters for staff in your own house.'; end if;
  if p_path is null or p_path not like p_profile::text || '/paperwork/offers/%' then raise exception 'That file is not in this person''s offer letter folder.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'staff-files' and name = p_path) then raise exception 'The file did not finish uploading. Please try again.'; end if;
  perform pg_advisory_xact_lock(hashtext('offer_uploads:' || p_profile::text));
  select coalesce(max(version), 0) + 1 into v from offer_uploads where profile_id = p_profile;
  insert into offer_uploads (profile_id, version, file_path, file_name, file_size, note, uploaded_by)
  values (p_profile, v, p_path, left(coalesce(nullif(trim(p_name), ''), 'Offer letter'), 200), p_size, nullif(left(trim(coalesce(p_note, '')), 300), ''), auth.uid())
  returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id, 'version', v);
end $$;

revoke execute on function public.can_handle_offer_files(uuid), public.add_offer_upload(uuid, text, text, bigint, text) from public, anon;
grant execute on function public.can_handle_offer_files(uuid), public.add_offer_upload(uuid, text, text, bigint, text) to authenticated, service_role;

-- Storage: Program Coordinators reach only the offers folder of staff in their own house.
-- (HR, directors, Program Managers and the Administrator are already covered by the staff-files rules.)
drop policy if exists "offer uploads coordinator read" on storage.objects;
create policy "offer uploads coordinator read" on storage.objects for select using (
  bucket_id = 'staff-files' and (storage.foldername(name))[2] = 'paperwork' and (storage.foldername(name))[3] = 'offers'
  and coalesce(app_level(), 0) = 2 and coalesce(app_group(), '') = ''
  and (storage.foldername(name))[1] <> (auth.uid())::text
  and staff_in_my_houses(try_uuid((storage.foldername(name))[1])));
drop policy if exists "offer uploads coordinator add" on storage.objects;
create policy "offer uploads coordinator add" on storage.objects for insert with check (
  bucket_id = 'staff-files' and (storage.foldername(name))[2] = 'paperwork' and (storage.foldername(name))[3] = 'offers'
  and coalesce(app_level(), 0) = 2 and coalesce(app_group(), '') = ''
  and (storage.foldername(name))[1] <> (auth.uid())::text
  and staff_in_my_houses(try_uuid((storage.foldername(name))[1])));
