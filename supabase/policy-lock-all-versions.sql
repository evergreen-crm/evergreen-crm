-- Once a person has signed a policy, its older version files are locked for them too, not only the version
-- they signed (test round 2, Nov 22 2026: older versions could still be opened from storage). The current
-- version stays open until they sign it, so a new version can still be read and re-signed.
-- HR, directors (level 4+) and the Administrator still read every file (storage policy "policy files read").
create or replace function public.policy_file_locked(obj text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from policy_versions v
      join policies p on p.id = v.policy_id
     where v.file_path = obj and p.require_signature
       and exists (select 1 from policy_acks a join policy_versions sv on sv.id = a.policy_version_id
                    where sv.policy_id = p.id and a.profile_id = auth.uid())
       and (v.id is distinct from p.current_version_id
            or exists (select 1 from policy_acks a2 where a2.policy_version_id = v.id and a2.profile_id = auth.uid())))
$$;
