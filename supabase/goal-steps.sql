-- =====================================================================
-- Evergreen CRM - Steps to achieve each goal (a goal has a list of steps, each ticked when done).
-- Read: anyone who can see the resident's house. Write: Program Coordinator and up for the house, and admins/managers.
-- Safe to run more than once.
-- =====================================================================
create table if not exists goal_steps (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  sort int not null default 0,
  step text not null,
  done_on date,
  created_at timestamptz not null default now()
);
alter table goal_steps enable row level security;

drop policy if exists gs_read on goal_steps;
create policy gs_read on goal_steps for select using (
  exists (select 1 from goals g join residents r on r.id = g.resident_id
          where g.id = goal_steps.goal_id and app_scope_home('ind', r.home_id))
);

drop policy if exists gs_write on goal_steps;
create policy gs_write on goal_steps for all
  using (
    app_role() in ('admin', 'manager')
    or exists (select 1 from goals g join residents r on r.id = g.resident_id
               where g.id = goal_steps.goal_id and app_level() >= 2 and app_scope_write('ind', r.home_id))
  )
  with check (
    app_role() in ('admin', 'manager')
    or exists (select 1 from goals g join residents r on r.id = g.resident_id
               where g.id = goal_steps.goal_id and app_level() >= 2 and app_scope_write('ind', r.home_id))
  );
