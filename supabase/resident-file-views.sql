-- =====================================================================
-- Evergreen CRM - Who opened each youth's or adult's file (Nov 20, 2026).
-- Every time someone opens a resident's file (any tab, including printing the full file and family views),
-- it is recorded: who, when, and which part. The same person on the same part is recorded once per 10 minutes.
-- Melvin (Nov 20): the log can be read by the Program Manager for that house, directors (level 4+), the CEO and
-- the Administrator. Nobody can change or delete it.
-- Run as migration resident_file_views. Safe to re-run.
-- =====================================================================
create table if not exists public.resident_file_views (
  id bigint generated always as identity primary key,
  resident_id uuid not null references public.residents(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tab text not null check (length(tab) <= 40),
  viewed_at timestamptz not null default now()
);
create index if not exists resident_file_views_res on public.resident_file_views (resident_id, viewed_at desc);
create index if not exists resident_file_views_who on public.resident_file_views (profile_id, resident_id, tab, viewed_at desc);
alter table public.resident_file_views enable row level security;
-- No policies: the table is only reached through the two functions below.

create or replace function public.can_read_file_log(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app_role() = 'admin'
      or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
      or (coalesce(app_level(), 0) = 3 and coalesce(app_group(), '') = '' and app_sees_home(resident_home(rid)));
$$;
revoke execute on function public.can_read_file_log(uuid) from public, anon;
grant execute on function public.can_read_file_log(uuid) to authenticated;

-- Called by the resident page. Only records a view the person is actually allowed to have.
create or replace function public.log_resident_view(rid uuid, t text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); vtab text := left(coalesce(nullif(t, ''), 'overview'), 40);
begin
  if me is null or rid is null then return; end if;
  if not (app_role() = 'admin' or app_scope_home('ind', resident_home(rid)) or is_family_of(rid)) then return; end if;
  if exists (select 1 from resident_file_views v where v.profile_id = me and v.resident_id = rid and v.tab = vtab
             and v.viewed_at > now() - interval '10 minutes') then return; end if;
  insert into resident_file_views (resident_id, profile_id, tab) values (rid, me, vtab);
end $$;
revoke execute on function public.log_resident_view(uuid, text) from public, anon;
grant execute on function public.log_resident_view(uuid, text) to authenticated;

create or replace function public.resident_file_log(rid uuid, lim int default 300)
returns table (viewed_at timestamptz, full_name text, access text, tab text)
language sql stable security definer set search_path = public as $$
  select v.viewed_at, p.full_name,
         case when p.role::text = 'family' then 'Family' when p.role::text = 'admin' then 'Administrator'
              when p.staff_group is not null then initcap(p.staff_group) else coalesce((select name from staff_levels l where l.level = p.level), 'Staff') end,
         v.tab
    from resident_file_views v join profiles p on p.id = v.profile_id
   where v.resident_id = rid and can_read_file_log(rid)
   order by v.viewed_at desc
   limit least(greatest(coalesce(lim, 300), 1), 2000);
$$;
revoke execute on function public.resident_file_log(uuid, int) from public, anon;
grant execute on function public.resident_file_log(uuid, int) to authenticated;
