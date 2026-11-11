-- =====================================================================
-- Evergreen CRM - Find box: searches that found nothing (Nov 11, 2026).
--   * When someone types in 🔍 Find and no page or how-to matches, the words are kept here so leaders can see
--     where staff get lost and the missing words can be added (lib/findGuide.js).
--   * Seen by directors (level 4+) and the Administrator: Quality -> Searches with no result.
--   * At most 40 a day per person, and the same words from the same person only once a day.
-- Run as migration find_misses. Safe to re-run.
-- =====================================================================

create table if not exists public.find_misses (
  id         uuid primary key default gen_random_uuid(),
  q          text not null,
  profile_id uuid references public.profiles on delete set null,
  role_label text,
  created_at timestamptz not null default now()
);
create index if not exists find_misses_created on public.find_misses (created_at desc);
alter table public.find_misses enable row level security;

drop policy if exists "find misses see" on public.find_misses;
create policy "find misses see" on public.find_misses for select using (
  app_role() = 'admin' or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = ''));

create or replace function public.log_find_miss(p_q text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := left(trim(regexp_replace(coalesce(p_q, ''), '\s+', ' ', 'g')), 120); p profiles;
begin
  if me is null or length(t) < 3 then return; end if;
  if (select count(*) from find_misses where profile_id = me and created_at > now() - interval '1 day') >= 40 then return; end if;
  if exists (select 1 from find_misses where profile_id = me and lower(q) = lower(t) and created_at > now() - interval '1 day') then return; end if;
  select * into p from profiles where id = me;
  insert into find_misses (q, profile_id, role_label)
  values (t, me, case when p.role = 'admin' then 'Administrator' when coalesce(p.staff_group, '') <> '' then initcap(p.staff_group)
                      else coalesce((select name from staff_levels where level = p.level), 'Staff') end);
end $$;
revoke execute on function public.log_find_miss(text) from public, anon;
grant execute on function public.log_find_miss(text) to authenticated, service_role;
