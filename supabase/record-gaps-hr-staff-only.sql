-- Missing details: HR (and Payroll) see staff gaps only, never youth or adults in care. Before, HR saw the names
-- of youth with missing details and links to files HR can't open (test round 2, Nov 22 2026).
drop policy if exists "record gaps see" on public.record_gaps;
create policy "record gaps see" on public.record_gaps for select to authenticated using (
  app_role() = 'admin'
  or (app_level() >= 3 and (coalesce(app_group(), '') = '' or kind = 'staff'))
  or (coalesce(app_group(), '') = 'hr' and kind = 'staff')
  or (app_level() = 2 and coalesce(app_group(), '') = '' and home_id is not null and home_id = app_home())
  or (kind = 'staff' and subject_id = auth.uid())
);
