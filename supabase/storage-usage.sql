-- =====================================================================
-- Evergreen CRM - Storage used (admin page). Safe to run again.
-- =====================================================================
create or replace function storage_usage()
returns table (bucket text, files bigint, bytes bigint)
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if app_role() is distinct from 'admin' then raise exception 'Admins only'; end if;
  return query
    select o.bucket_id::text, count(*)::bigint, coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
    from storage.objects o group by o.bucket_id
    union all
    select '_database'::text, 0::bigint, pg_database_size(current_database())::bigint;
end $$;
revoke execute on function storage_usage() from public;
grant execute on function storage_usage() to authenticated;

-- HR Policy Binder: the cover and file name say version 3.0
update policy_versions v set version_label = '3.0'
from policies p where p.id = v.policy_id and p.code = 'ECC-HR-POL-2026-001' and v.version_label = '1.0';
