-- =====================================================================
-- Evergreen CRM - start a NEW house (launch plan) from an existing one.
-- create_launch_plan() makes a fresh plan and copies from a source plan:
--   * the 12 milestones and their tasks (no completion dates)
--   * the documents-before-opening list (status back to Not started, no files)
-- The 87-item House checklist is added automatically by the launch_plans trigger
-- (supabase/launch-checklist.sql). Director of Operations+ (level 4) only.
-- Run after launch-people.sql and launch-checklist.sql. Safe to run again.
-- =====================================================================
create or replace function create_launch_plan(p_service_type text, p_name text, p_address text default null, p_copy_from uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare src uuid; new_id uuid; m record; new_m uuid;
begin
  if app_level() < 4 then raise exception 'Only a Director of Operations or above can start a new house plan.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the new house a name.'; end if;
  -- Source: the plan chosen, else the newest plan of the same service type, else the newest plan.
  src := coalesce(p_copy_from,
    (select id from launch_plans where service_type = p_service_type order by created_at desc limit 1),
    (select id from launch_plans order by created_at desc limit 1));

  insert into launch_plans (service_type, care_setting_name, care_setting_address, submitted_by,
                            goals, assumptions, risks, risk_actions, other_notes, transition_days, payment_option, status)
  select p_service_type, trim(p_name), nullif(trim(p_address), ''), s.submitted_by,
         s.goals, s.assumptions, s.risks, s.risk_actions, s.other_notes, coalesce(s.transition_days, 90), s.payment_option, 'Draft'
  from (select * from launch_plans where id = src) s
  right join (select 1) one on true
  returning id into new_id;

  for m in select * from launch_milestones where plan_id = src order by number loop
    insert into launch_milestones (plan_id, number, title, proposed_days, deliverable)
    values (new_id, m.number, m.title, m.proposed_days, m.deliverable) returning id into new_m;
    insert into launch_tasks (milestone_id, sort, task, is_heading, proposed_days)
    select new_m, t.sort, t.task, t.is_heading, t.proposed_days from launch_tasks t where t.milestone_id = m.id;
  end loop;

  insert into launch_documents (plan_id, sort, category, document, requirement, days_before_opening, owner_role, source_notes)
  select new_id, d.sort, d.category, d.document, d.requirement, d.days_before_opening, d.owner_role, d.source_notes
  from launch_documents d where d.plan_id = src
  on conflict (plan_id, document) do nothing;

  return new_id;  -- the House checklist is added by the launch_plans_checklist trigger
end $$;
grant execute on function create_launch_plan(text, text, text, uuid) to authenticated;

select 'create_launch_plan ready' as result;
