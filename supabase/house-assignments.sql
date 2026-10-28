-- Step 2: house assignments. Admin and CEO (level 7+) set who is assigned to which house.
-- Program Managers (manager, level 3) and Program Coordinators (staff, level 2) see only their assigned houses.
-- Directors and above (level 4+) see every house and every staff profile.
drop policy if exists "manager homes write" on public.manager_homes;
create policy "manager homes write" on public.manager_homes for all
  using (app_role() = 'admin' or app_level() >= 7)
  with check (app_role() = 'admin' or app_level() >= 7);

drop policy if exists "profiles see" on public.profiles;
create policy "profiles see" on public.profiles for select using (
  id = auth.uid()
  or app_role() = 'admin'
  or app_level() >= 4
  or app_group() in ('hr', 'payroll')
  or (app_level() in (2, 3) and app_group() is null and (
        home_id = app_home()
        or home_id in (select m.home_id from manager_homes m where m.profile_id = auth.uid())))
  or (app_role() = 'staff' and home_id = app_home())
);
