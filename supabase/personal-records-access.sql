-- =====================================================================
-- Evergreen CRM - Offer letters, onboarding, ID cards and GPS check-ins follow the staff-file rule (Nov 5, 2026).
-- Found by a permission test (rolled back): any manager-level account (Program Manager and up) could see every
-- person's onboarding personal details (home address), ID card and GPS check-ins company-wide (e.g. the Admin's),
-- and level 3+ could read, create or change ANY offer letter (pay), including the CEO's.
-- Now (same rule as staff-file-access.sql):
--   see:    yourself; Admin; HR (not GPS); directors (level 4+); Program Managers for staff in their houses.
--   change: Admin; HR; directors; Program Managers for staff in their houses below them.
--   Staff still fill in their own onboarding items; nobody edits their own offer letter.
--   Sending an offer still works through send_offer(); a new hire with no house yet is handled by HR/directors.
-- Needs staff-file-access.sql (staff_in_my_houses). Run as migration personal_records_access. Safe to re-run.
-- =====================================================================
create or replace function public.can_manage_person(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app_role() = 'admin' or coalesce(app_group(), '') = 'hr'
      or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
      or (coalesce(app_level(), 0) = 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(p_profile));
$$;
revoke execute on function public.can_manage_person(uuid) from public, anon;
grant execute on function public.can_manage_person(uuid) to authenticated, service_role;

-- offer letters
drop policy if exists offers_read on public.offer_letters;
drop policy if exists offers_write on public.offer_letters;
create policy offers_read on public.offer_letters for select using (profile_id = auth.uid() or can_manage_person(profile_id));
create policy offers_write on public.offer_letters for all
  using (profile_id <> auth.uid() and can_manage_person(profile_id))
  with check (profile_id <> auth.uid() and can_manage_person(profile_id));

-- onboarding ("hr onboardings", "hr onboarding items" and the Admin-only delete rules stay)
drop policy if exists "onb see" on public.onboardings;
drop policy if exists "onb add" on public.onboardings;
drop policy if exists "onb edit" on public.onboardings;
create policy "onb see" on public.onboardings for select using (profile_id = auth.uid() or can_manage_person(profile_id));
create policy "onb add" on public.onboardings for insert with check (can_manage_person(profile_id));
create policy "onb edit" on public.onboardings for update
  using (profile_id = auth.uid() or can_manage_person(profile_id))
  with check (profile_id = auth.uid() or can_manage_person(profile_id));

drop policy if exists "onb items see" on public.onboarding_items;
drop policy if exists "onb items add" on public.onboarding_items;
drop policy if exists "onb items edit" on public.onboarding_items;
create policy "onb items see" on public.onboarding_items for select using (profile_id = auth.uid() or can_manage_person(profile_id));
create policy "onb items add" on public.onboarding_items for insert with check (can_manage_person(profile_id));
create policy "onb items edit" on public.onboarding_items for update
  using (profile_id = auth.uid() or can_manage_person(profile_id))
  with check (profile_id = auth.uid() or can_manage_person(profile_id));

-- ID cards ("hr id cards" stays)
drop policy if exists "id cards see" on public.id_cards;
drop policy if exists "id cards manage" on public.id_cards;
create policy "id cards see" on public.id_cards for select using (profile_id = auth.uid() or can_manage_person(profile_id));
create policy "id cards manage" on public.id_cards for all using (can_manage_person(profile_id)) with check (can_manage_person(profile_id));

-- GPS check-ins: not HR (they don't need staff locations)
drop policy if exists "checkins see" on public.location_checkins;
create policy "checkins see" on public.location_checkins for select using (
  profile_id = auth.uid() or app_role() = 'admin'
  or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
  or (coalesce(app_level(), 0) = 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id, false))
);
