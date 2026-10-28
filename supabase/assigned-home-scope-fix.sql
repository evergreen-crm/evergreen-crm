-- =====================================================================
-- Evergreen CRM - Program Coordinators and Program Managers see their assigned homes
-- in Activities, House contacts, Night checks and Resident consents (not only their own home).
-- Uses app_scope_home(section, home), the same check as residents, entries, goals and shifts.
-- Levels 4 to 7 already see all homes. Safe to run more than once.
-- =====================================================================

-- Activity plans
drop policy if exists ap_read on activity_plans;
create policy ap_read on activity_plans for select using (
  app_level() >= 3 or app_home() = home_id or app_scope_home('ind', home_id)
);
drop policy if exists ap_write on activity_plans;
create policy ap_write on activity_plans for all
  using (app_role() = 'admin' or app_level() >= 3 or (app_level() = 2 and app_scope_write('ind', home_id)))
  with check (app_role() = 'admin' or app_level() >= 3 or (app_level() = 2 and app_scope_write('ind', home_id)));

-- House contacts
drop policy if exists hc_read on house_contacts;
create policy hc_read on house_contacts for select using (
  app_role() = 'admin' or app_level() >= 3 or app_home() = home_id or app_scope_home('ind', home_id)
);
drop policy if exists hc_write on house_contacts;
create policy hc_write on house_contacts for all
  using (app_role() = 'admin' or app_level() >= 3 or (app_level() = 2 and app_scope_write('ind', home_id)))
  with check (app_role() = 'admin' or app_level() >= 3 or (app_level() = 2 and app_scope_write('ind', home_id)));

-- Night checks (a Program Coordinator sees the night checks of every home in scope)
drop policy if exists nc_read on night_checks;
create policy nc_read on night_checks for select using (
  profile_id = auth.uid() or app_level() >= 3 or (app_level() = 2 and app_scope_home('ind', home_id))
);

-- Resident consents
drop policy if exists rc_read on resident_consents;
create policy rc_read on resident_consents for select using (
  app_role() = any (array['admin'::user_role, 'manager'::user_role])
  or (app_role() = 'staff'::user_role and resident_home(resident_id) = app_home())
  or app_scope_home('ind', resident_home(resident_id))
);
drop policy if exists rc_write on resident_consents;
create policy rc_write on resident_consents for insert with check (
  app_role() = any (array['admin'::user_role, 'manager'::user_role])
  or (app_level() >= 2 and app_scope_home('ind', resident_home(resident_id)))
);
