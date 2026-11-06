-- =====================================================================
-- Evergreen CRM - Who can open stored files (Nov 5, 2026).
-- Before: any manager-level account (Program Manager and up) could open EVERY staff member's files in
-- staff-files (CRC, signed paperwork, offer letters, certificates - the CEO's too) and every house's resident
-- documents and inventory photos; Program Coordinators with a second house couldn't open its documents.
-- Now the files follow the same rules as the records they belong to:
--   staff-files/<person id>/...   open: yourself; Admin; HR; directors (4+); Program Managers for staff in
--                                 their houses below them. Delete: Admin, HR, directors.
--   documents/<house id>/...      open: anyone who can see that house's resident records (section grid 'ind').
--                                 Upload: anyone who can write there. Delete: house managers and Admin.
--   inventory-photos/<house id>/  open / add: the same house rules.
-- id-photos, policies, sign-docs, qa-evidence, launch-files and academy-media are unchanged.
-- Needs staff-file-access.sql (staff_in_my_houses). Run as migration storage_access. Safe to re-run.
-- =====================================================================
create or replace function public.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- staff-files
drop policy if exists "staff files read" on storage.objects;
drop policy if exists "staff files upload" on storage.objects;
drop policy if exists "staff files delete" on storage.objects;
drop policy if exists "hr staff files read" on storage.objects;
drop policy if exists "hr staff files upload" on storage.objects;
create policy "staff files read" on storage.objects for select to authenticated using (
  bucket_id = 'staff-files' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or app_role() = 'admin' or coalesce(app_group(), '') = 'hr'
    or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
    or (coalesce(app_level(), 0) = 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(try_uuid((storage.foldername(name))[1])))
  )
);
create policy "staff files upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'staff-files' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or app_role() = 'admin' or coalesce(app_group(), '') = 'hr'
    or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
    or (coalesce(app_level(), 0) = 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(try_uuid((storage.foldername(name))[1])))
  )
);
create policy "staff files delete" on storage.objects for delete to authenticated using (
  bucket_id = 'staff-files' and (app_role() = 'admin' or coalesce(app_group(), '') = 'hr'
    or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = ''))
);

-- documents (resident and house documents)
drop policy if exists "evergreen docs read" on storage.objects;
drop policy if exists "evergreen docs upload" on storage.objects;
drop policy if exists "evergreen docs delete" on storage.objects;
create policy "evergreen docs read" on storage.objects for select to authenticated using (
  bucket_id = 'documents' and (app_role() = 'admin' or app_scope_home('ind', try_uuid((storage.foldername(name))[1])))
);
create policy "evergreen docs upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'documents' and (app_role() = 'admin' or ind_write(try_uuid((storage.foldername(name))[1])))
);
create policy "evergreen docs delete" on storage.objects for delete to authenticated using (
  bucket_id = 'documents' and (app_role() = 'admin' or ind_manage(try_uuid((storage.foldername(name))[1])))
);

-- inventory-photos
drop policy if exists inv_photos_read on storage.objects;
drop policy if exists inv_photos_insert on storage.objects;
create policy inv_photos_read on storage.objects for select to authenticated using (
  bucket_id = 'inventory-photos' and (app_role() = 'admin' or app_scope_home('ind', try_uuid((storage.foldername(name))[1])))
);
create policy inv_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'inventory-photos' and (app_role() = 'admin'
    or (coalesce(app_level(), 0) >= 2 and app_scope_write('ind', try_uuid((storage.foldername(name))[1]))))
);
