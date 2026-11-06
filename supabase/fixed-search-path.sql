-- =====================================================================
-- Evergreen CRM - Fixed search path for every CRM function (Nov 5, 2026).
-- Supabase's security check flagged 32 functions with no fixed search_path ("function_search_path_mutable"),
-- which lets a function be pointed at a look-alike table. This pins every CRM function in the public schema
-- that doesn't have one to: public, extensions, pg_temp. Behaviour is unchanged.
-- Also: the test Program Coordinator's name was saved as its email address; renamed to "Test PC".
-- RULE FOR NEW FUNCTIONS: add  set search_path = public  to every new function.
-- Run as migration fixed_search_path. Safe to re-run.
-- =====================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
     where ns.nspname = 'public' and d.objid is null and p.prokind in ('f', 'p')
       and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig);
  end loop;
end $$;

update public.profiles set full_name = 'Test PC'
 where id = '7073fa33-bc96-43c4-8a8e-dcc7c5e14743' and full_name like 'inbox.ms1187+pc@gmail.com%';
