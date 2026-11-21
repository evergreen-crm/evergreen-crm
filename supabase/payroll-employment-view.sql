-- Payroll can read signed (Accepted) offer letters, read only, for the 📇 Staff employment page
-- (app/timesheet/staff). Payroll already reads staff_details (sd_see). Nothing else changes.
drop policy if exists "offers payroll read" on public.offer_letters;
create policy "offers payroll read" on public.offer_letters for select to authenticated
  using (coalesce(app_group(), '') = 'payroll' and status = 'Accepted');
