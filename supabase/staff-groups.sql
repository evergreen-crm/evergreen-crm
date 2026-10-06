-- =====================================================================
-- Evergreen CRM - HR and Payroll access groups.
-- HR and Payroll are chosen in the same "Access level" list as levels 1-8.
-- They work across all homes but do NOT see residents or care records:
--   HR      -> staff files, certificates, training, onboarding, ID cards, policy sign-offs,
--              prescreening, the HR portal division, HR / training KPIs.
--   Payroll -> timesheets (see, fix, approve), schedules, staff employment details,
--              the Finance portal division, payroll / staffing KPIs.
-- Stored as profiles.staff_group ('hr' or 'payroll') with level 2 (role 'staff', no home).
-- Run once in Supabase SQL Editor (after access-levels.sql). Safe to run again.
-- These policies ADD access; nothing existing is taken away.
-- =====================================================================

alter table profiles add column if not exists staff_group text;
alter table profiles drop constraint if exists profiles_staff_group_check;
alter table profiles add constraint profiles_staff_group_check check (staff_group in ('hr', 'payroll'));

create or replace function app_group() returns text
language sql stable security definer set search_path = public as $$
  select staff_group from profiles where id = auth.uid() and active and role = 'staff'
$$;
grant execute on function app_group() to authenticated;

-- Portal divisions: HR opens the HR division, Payroll opens Finance (view + edit).
-- Group members see only their own division (not Program, QA, etc.), plus any one-off grants.
create or replace function has_division(div text, need_edit boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select app_level() > 0 and (
    (app_group() is null and exists (
      select 1 from division_levels d
      where d.division = div
        and app_level() >= case when need_edit then d.edit_level else d.view_level end))
    or (app_group() = 'hr' and div = 'hr')
    or (app_group() = 'payroll' and div = 'finance')
    or exists (
      select 1 from portal_access a join profiles p on p.id = a.profile_id
      where a.profile_id = auth.uid() and a.division = div and p.active
        and (not need_edit or a.can_edit)));
$$;

-- Prescreening: HR group gets the HR prescreen role automatically.
create or replace function prescreen_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when app_role() = 'admin' then 'admin'
    when app_role() is null then null
    when app_group() = 'hr' then 'hr'
    else (select access from prescreen_access where profile_id = auth.uid())
  end
$$;

-- People and house names (both groups)
drop policy if exists "groups see staff" on profiles;
create policy "groups see staff" on profiles for select using (app_group() is not null and role <> 'family');
drop policy if exists "groups see homes" on homes;
create policy "groups see homes" on homes for select using (app_group() is not null);

-- HR: staff files
drop policy if exists "hr staff_details" on staff_details;
create policy "hr staff_details" on staff_details for all using (app_group() = 'hr') with check (app_group() = 'hr');
drop policy if exists "hr certifications" on certifications;
create policy "hr certifications" on certifications for all using (app_group() = 'hr') with check (app_group() = 'hr');
drop policy if exists "hr trainings" on trainings;
create policy "hr trainings" on trainings for all using (app_group() = 'hr') with check (app_group() = 'hr');
drop policy if exists "hr onboardings" on onboardings;
create policy "hr onboardings" on onboardings for all using (app_group() = 'hr') with check (app_group() = 'hr');
drop policy if exists "hr onboarding items" on onboarding_items;
create policy "hr onboarding items" on onboarding_items for all using (app_group() = 'hr') with check (app_group() = 'hr');
drop policy if exists "hr id cards" on id_cards;
create policy "hr id cards" on id_cards for all using (app_group() = 'hr') with check (app_group() = 'hr');
drop policy if exists "hr policy acks" on policy_acks;
create policy "hr policy acks" on policy_acks for select using (app_group() = 'hr');
drop policy if exists "hr staff files read" on storage.objects;
drop policy if exists "hr staff files upload" on storage.objects;
create policy "hr staff files read" on storage.objects for select to authenticated using (bucket_id = 'staff-files' and app_group() = 'hr');
create policy "hr staff files upload" on storage.objects for insert to authenticated with check (bucket_id = 'staff-files' and app_group() = 'hr');

-- Payroll: hours and schedules
drop policy if exists "payroll staff_details see" on staff_details;
create policy "payroll staff_details see" on staff_details for select using (app_group() = 'payroll');
drop policy if exists "payroll time" on time_entries;
create policy "payroll time" on time_entries for all using (app_group() = 'payroll') with check (app_group() = 'payroll');
drop policy if exists "payroll shifts see" on shifts;
create policy "payroll shifts see" on shifts for select using (app_group() = 'payroll');
drop policy if exists "hr time see" on time_entries;
create policy "hr time see" on time_entries for select using (app_group() = 'hr');
