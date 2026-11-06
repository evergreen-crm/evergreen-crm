-- =====================================================================
-- Evergreen CRM - Signed paperwork stays in the staff file; staff don't keep seeing it (Nov 6, 2026).
-- Melvin: staff shouldn't see the policies and documents they signed after they sign; keep them in the saved
-- folders (the staff file). After signing, the only paper staff can open is their offer letter.
--   * Signed-paperwork PDFs (paperwork_pdfs, staff-files/<person>/paperwork/): no longer visible to the person;
--     still visible to HR, Admin, directors and their house leaders.
--   * Documents sent for signature: a signer sees a document only while it's waiting for their signature.
--     Once signed (or declined), it's gone from their list; the sender and managers still see it.
--   * Offer letters are unchanged: staff can always open their own.
-- Run as migration staff_own_documents. Safe to re-run.
-- =====================================================================
drop policy if exists paperwork_read on public.paperwork_pdfs;
create policy paperwork_read on public.paperwork_pdfs for select using (
  app_role() = 'admin' or coalesce(app_group(), '') = 'hr' or coalesce(app_level(), 0) >= 4
  or (coalesce(app_level(), 0) between 2 and 3 and coalesce(app_group(), '') = ''
      and profile_id <> auth.uid()
      and exists (select 1 from profiles p where p.id = paperwork_pdfs.profile_id and app_sees_home(p.home_id)))
);

drop policy if exists srs_read on public.sign_request_signers;
create policy srs_read on public.sign_request_signers for select using (
  (profile_id = auth.uid() and status = 'Waiting') or can_manage_sign_request(request_id)
);

create or replace function public.can_see_sign_request(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage_sign_request(rid)
      or exists (select 1 from sign_request_signers s where s.request_id = rid and s.profile_id = auth.uid() and s.status = 'Waiting');
$$;

-- staff-files: a person can no longer open their own signed-paperwork folder (other files, like their offer
-- letter and the certificates they upload, are unchanged).
drop policy if exists "staff files read" on storage.objects;
create policy "staff files read" on storage.objects for select to authenticated using (
  bucket_id = 'staff-files' and (
    ((storage.foldername(name))[1] = auth.uid()::text and (storage.foldername(name))[2] is distinct from 'paperwork')
    or app_role() = 'admin' or coalesce(app_group(), '') = 'hr'
    or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
    or (coalesce(app_level(), 0) = 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(try_uuid((storage.foldername(name))[1])))
  )
);
