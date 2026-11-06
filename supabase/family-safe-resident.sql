-- =====================================================================
-- Evergreen CRM - Family accounts see only a safe card of their family member (Nov 5, 2026).
-- Before: the "residents see" rule let a family account read the WHOLE resident record through the
-- database (PHN, diagnoses, behaviour support notes, case worker and funder contacts, profile notes),
-- even though the family page only showed the name. No family accounts existed yet, so nothing was exposed.
-- Now:
--   * families can no longer read the residents table at all;
--   * family_residents() returns only: name, preferred name, status, house name — for linked residents only.
-- Goals, signed shared notes, shared appointments and messages are unchanged (they have their own rules).
-- Run as migration family_safe_resident. Safe to run more than once.
-- =====================================================================
drop policy if exists "residents see" on public.residents;
create policy "residents see" on public.residents for select using (app_scope_home('ind', home_id));

create or replace function public.family_residents()
returns table (id uuid, first_name text, last_name text, preferred_name text, status text, home_id uuid, home_name text)
language sql stable security definer set search_path = public as $$
  select r.id, r.first_name, r.last_name, r.preferred_name, r.status::text, r.home_id, h.name
    from residents r
    left join homes h on h.id = r.home_id
   where app_role() = 'family' and is_family_of(r.id)
   order by r.last_name, r.first_name;
$$;
revoke execute on function public.family_residents() from public, anon;
grant execute on function public.family_residents() to authenticated;
