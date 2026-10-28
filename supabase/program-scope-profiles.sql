-- Program scope for staff profiles: a manager sees only the staff in houses (programs) they are assigned to.
-- Admin, CEO (level 7+), HR and Payroll still see everyone. Staff see their own home.
-- Run after: section-access.sql, staff-groups.sql, access-levels.sql (for app_role / app_level / app_group / manager_homes).
drop policy if exists "profiles see" on public.profiles;
create policy "profiles see" on public.profiles for select using (
  id = auth.uid()
  or app_role() = 'admin'
  or app_level() >= 7
  or app_group() in ('hr', 'payroll')
  or (app_role() = 'manager' and (
        home_id = app_home()
        or home_id in (select m.home_id from manager_homes m where m.profile_id = auth.uid())))
  or (app_role() = 'staff' and home_id = app_home())
);
