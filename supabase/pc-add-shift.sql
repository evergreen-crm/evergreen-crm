-- Nov 21, 2026 (Melvin: yes): Program Coordinators (level 2) can add, remove and copy shifts on the
-- Schedule page for the house they schedule, the same rule as the house rota (can_schedule).
-- The "cleared staff only" check on shifts still applies. Managers and the Administrator keep "shifts edit".
-- Run on BOTH databases. Safe to re-run.
drop policy if exists "shifts pc edit" on public.shifts;
create policy "shifts pc edit" on public.shifts for all to authenticated
  using (app_role() = 'staff' and can_schedule(home_id))
  with check (app_role() = 'staff' and can_schedule(home_id));
