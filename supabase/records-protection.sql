-- =====================================================================
-- Evergreen CRM - Protect incidents, clock times, certificates and training records (Nov 5, 2026).
-- Found by a "what can each role change" test of all 8 test roles (rolled back, nothing changed):
--   1. Program Managers and directors could DELETE incidents (reportable records; the app never deletes them).
--   2. Staff could change their own clock-in time (erasing a "late" record) before approval.
--      Staff only need to add their break and a note; clock in/out runs through the ID card page.
--   3. Any Program Manager could add, change or delete any staff member's certificates (incl. the CRC expiry
--      that decides "cleared to work") and training records, in every house.
-- Now (same rule as staff-file-access.sql): HR, Admin and directors company-wide; Program Managers only for
-- staff in their own houses below their level; staff see their own. Every change is still in the audit log.
-- Needs staff-file-access.sql (staff_in_my_houses). Run as migration records_protection. Safe to re-run.
-- Applied Nov 5, 2026 (migration records_protection) and re-tested for all 8 test roles.
-- =====================================================================

-- 1. Incidents are never deleted, except by an Administrator (e.g. removing test data).
drop policy if exists "incidents delete" on public.incidents;
create policy "incidents delete" on public.incidents for delete using (app_role() = 'admin');

-- 2. Anyone editing THEIR OWN time entry (staff, managers, payroll alike) may change only the break and the
--    note. Times are fixed by someone else: a PC/PM, Payroll or an Administrator.
create or replace function public.time_entries_own_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() <> old.profile_id
     or coalesce(current_setting('evg.safe_clock', true), '') = '1'
     or coalesce(app_role()::text, '') = 'admin' then
    return new;
  end if;
  if new.clock_in is distinct from old.clock_in
     or (old.clock_out is not null and new.clock_out is distinct from old.clock_out)
     or new.late_minutes is distinct from old.late_minutes or new.late_reason is distinct from old.late_reason
     or new.overtime_minutes is distinct from old.overtime_minutes or new.shift_id is distinct from old.shift_id
     or new.home_id is distinct from old.home_id or new.unscheduled is distinct from old.unscheduled
     or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at then
    raise exception 'You can add your break and a note. To fix a clock-in or clock-out time, ask your Program Coordinator.';
  end if;
  return new;
end $$;
drop trigger if exists time_entries_own_edit on public.time_entries;
create trigger time_entries_own_edit before update on public.time_entries
  for each row execute function public.time_entries_own_edit();

-- 3a. Certificates
drop policy if exists "certifications edit" on public.certifications;
drop policy if exists "certifications see" on public.certifications;
drop policy if exists cert_see on public.certifications;
drop policy if exists cert_add on public.certifications;
drop policy if exists cert_change on public.certifications;
drop policy if exists cert_remove on public.certifications;
-- ("hr certifications" stays: HR can do everything with certificates.)
create policy cert_see on public.certifications for select using (
  profile_id = auth.uid() or app_role() = 'admin' or coalesce(app_group(), '') = 'hr'
  or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
  or (coalesce(app_level(), 0) between 2 and 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id, false))
);
create policy cert_add on public.certifications for insert with check (
  app_role() = 'admin' or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
  or (coalesce(app_level(), 0) = 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id))
);
create policy cert_change on public.certifications for update
  using (app_role() = 'admin' or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = ''))
  with check (app_role() = 'admin' or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = ''));
create policy cert_remove on public.certifications for delete
  using (app_role() = 'admin' or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = ''));

-- 3b. Training records ("hr trainings" and "trainings self add" stay as they are).
drop policy if exists "trainings edit" on public.trainings;
drop policy if exists "trainings see" on public.trainings;
drop policy if exists tr_see on public.trainings;
drop policy if exists tr_add on public.trainings;
drop policy if exists tr_change on public.trainings;
drop policy if exists tr_remove on public.trainings;
create policy tr_see on public.trainings for select using (
  profile_id = auth.uid() or app_role() = 'admin' or coalesce(app_group(), '') = 'hr'
  or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
  or (coalesce(app_level(), 0) between 2 and 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id, false))
);
create policy tr_add on public.trainings for insert with check (
  app_role() = 'admin' or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
  or (coalesce(app_level(), 0) = 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id))
);
create policy tr_change on public.trainings for update
  using (app_role() = 'admin' or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
         or (coalesce(app_level(), 0) = 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id)))
  with check (app_role() = 'admin' or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
         or (coalesce(app_level(), 0) = 3 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id)));
-- Staff may remove a training they added themselves that hasn't been verified yet (My training page).
create policy tr_remove on public.trainings for delete
  using (app_role() = 'admin' or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
         or (profile_id = auth.uid() and verified_by is null));
