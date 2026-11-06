-- =====================================================================
-- Evergreen CRM - Who sees and changes staff HR details and staff file records (Nov 5, 2026).
-- Found by a permission test of all 8 test roles (rolled back, nothing changed):
--   * Program Managers (role 'manager') could see AND change every staff member's HR details company-wide,
--     including the CEO's (separation reason, rehire eligibility, exit interview).
--   * Level 3+ could read and add performance evaluations / supervision for ANYONE, including the CEO.
--   * HR could not see performance evaluations or supervision at all (HR keeps and prints the staff file).
--   * Program Coordinators could not see their own house staff's details (the schedule uses FT/PT).
--   * Staff entering their emergency contact during onboarding: the copy for their ID card never saved.
-- Now (Evergreen rule: PCs and PMs see only the houses they are assigned to):
--   staff_details  see:    yourself; Admin; HR; Payroll; directors (level 4+); PCs/PMs for staff in their houses.
--                  change: Admin; HR; directors; PCs/PMs for staff in their houses below their level.
--                  staff change only their own emergency contact, through set_my_emergency_contact().
--   staff_file_records see: yourself; Admin; HR; directors; PMs for staff in their houses below their level.
--                  add:    Admin; HR; directors; PMs for staff in their houses below their level (not PCs).
-- Run as migration staff_file_access. Safe to run more than once.
-- =====================================================================

-- Is this person in a house the viewer can see, and below the viewer's level?
create or replace function public.staff_in_my_houses(p_profile uuid, p_below boolean default true) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
     where p.id = p_profile and p.home_id is not null and app_sees_home(p.home_id)
       and (not p_below or (case when p.role = 'admin' then 8 else coalesce(p.level, 1) end) < coalesce(app_level(), 0))
  );
$$;
revoke execute on function public.staff_in_my_houses(uuid, boolean) from public, anon;
grant execute on function public.staff_in_my_houses(uuid, boolean) to authenticated, service_role;

-- staff_details
drop policy if exists "hr staff_details" on public.staff_details;
drop policy if exists "staff_details edit" on public.staff_details;
drop policy if exists "payroll staff_details see" on public.staff_details;
drop policy if exists "staff_details see" on public.staff_details;
drop policy if exists sd_see on public.staff_details;
drop policy if exists sd_insert on public.staff_details;
drop policy if exists sd_update on public.staff_details;
drop policy if exists sd_delete on public.staff_details;

create policy sd_see on public.staff_details for select using (
  profile_id = auth.uid()
  or app_role() = 'admin'
  or coalesce(app_group(), '') in ('hr', 'payroll')
  or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
  or (coalesce(app_level(), 0) between 2 and 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id, false))
);
create policy sd_insert on public.staff_details for insert with check (
  app_role() = 'admin'
  or coalesce(app_group(), '') = 'hr'
  or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
  or (coalesce(app_level(), 0) between 2 and 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id))
);
create policy sd_update on public.staff_details for update using (
  app_role() = 'admin'
  or coalesce(app_group(), '') = 'hr'
  or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
  or (coalesce(app_level(), 0) between 2 and 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id))
) with check (
  app_role() = 'admin'
  or coalesce(app_group(), '') = 'hr'
  or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
  or (coalesce(app_level(), 0) between 2 and 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id))
);
create policy sd_delete on public.staff_details for delete using (app_role() = 'admin' or coalesce(app_group(), '') = 'hr');

-- Staff update only their own emergency contact (onboarding "personal information"; shown on the ID card).
create or replace function public.set_my_emergency_contact(p_contact text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  insert into staff_details (profile_id, emergency_contact, emergency_phone, updated_at)
  values (auth.uid(), left(p_contact, 200), left(p_phone, 40), now())
  on conflict (profile_id) do update set emergency_contact = excluded.emergency_contact,
    emergency_phone = excluded.emergency_phone, updated_at = now();
end $$;
revoke execute on function public.set_my_emergency_contact(text, text) from public, anon;
grant execute on function public.set_my_emergency_contact(text, text) to authenticated;

-- staff_file_records (performance evaluations, supervision, job description acknowledgement)
drop policy if exists sfr_read on public.staff_file_records;
drop policy if exists sfr_write on public.staff_file_records;
create policy sfr_read on public.staff_file_records for select using (
  profile_id = auth.uid()
  or app_role() = 'admin'
  or coalesce(app_group(), '') = 'hr'
  or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
  or (coalesce(app_level(), 0) = 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id))
);
create policy sfr_write on public.staff_file_records for insert with check (
  app_role() = 'admin'
  or coalesce(app_group(), '') = 'hr'
  or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
  or (coalesce(app_level(), 0) = 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id))
);
