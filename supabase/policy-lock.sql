-- Signed policies are locked for the person who signed them (they read the binder in the house).
-- The portal already hides them; this also stops the policy file being fetched from storage directly.
-- HR, directors (level 4+) and the Administrator are not locked.
create or replace function public.policy_file_locked(obj text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from policy_versions v
      join policies p on p.id = v.policy_id
      join policy_acks a on a.policy_version_id = v.id
     where v.file_path = obj and a.profile_id = auth.uid() and p.require_signature)
$$;
revoke execute on function public.policy_file_locked(text) from public, anon;
grant execute on function public.policy_file_locked(text) to authenticated, service_role;

drop policy if exists "policy files read" on storage.objects;
create policy "policy files read" on storage.objects for select to authenticated using (
  bucket_id = 'policies'
  and app_role() = any (array['admin'::user_role, 'manager'::user_role, 'staff'::user_role])
  and (app_role() = 'admin'
       or coalesce(app_group(), '') = 'hr'
       or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
       or not policy_file_locked(name))
);
