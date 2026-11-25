-- =====================================================================
-- Evergreen CRM - SHSS Legacy Agreement Transition-In Plan & Milestone Tracker
-- For SHSS legacy agreements with an initial 12-month term. Checkpoints at 30 days,
-- 60 days (plan approved), 90-day status updates and the 12-month term end.
-- Run in Supabase -> SQL Editor AFTER access-levels.sql. Safe to run again.
-- Access follows the launch plans: Program Manager+ (3) can see and tick off obligations;
-- Director of Operations+ (4) can create and change plan details.
-- Page: /legacy
-- =====================================================================

create table if not exists legacy_plans (
  id uuid primary key default gen_random_uuid(),
  service_provider_name text,
  care_setting_name text,
  care_setting_address text,
  shss_service_type text check (shss_service_type in
    ('Emergency Care','Low-Barrier Short-Term Stabilization Care','Respite Care','Specialized Long-Term Care')),
  agreement_number text,
  effective_date date,           -- Effective Date of Agreement; every due date counts from it
  term_end_date date,            -- end of the initial term (excluding extensions)
  plan_submitted_on date,        -- Transition-In Plan submission date
  submitted_by text,
  first_draft_on date,           -- initial draft sent to the Director (within 2 weeks)
  thirty_day_review_on date,     -- 30-day review meeting with the Director
  plan_approved_on date,         -- Director's final approval (within 60 days)
  initial_90_update_due date,    -- initial 90-day written status update (90 days after approval)
  source_documents text,         -- the paper forms this plan came from
  notes text,
  status text not null default 'Draft' check (status in ('Draft','Submitted to Director','Approved','Signed','Term complete')),
  created_at timestamptz default now()
);

-- The standard obligations, copied into every new plan (edit here, not in the page).
create table if not exists legacy_obligation_template (
  sort int primary key,
  stage text not null check (stage in ('30-day','60-day','90-day updates','12-month')),
  obligation text not null,
  reference text
);

create table if not exists legacy_obligations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references legacy_plans(id) on delete cascade,
  sort int not null,
  stage text not null check (stage in ('30-day','60-day','90-day updates','12-month')),
  obligation text not null,
  reference text,
  status text not null default 'In Progress' check (status in ('Achieved','In Progress')),
  action_plan text,              -- required while In Progress: steps, owner, 90-day target dates
  achieved_on date,
  director_feedback text,        -- notes from the review meetings with the Director
  owner_id uuid references profiles(id),
  unique (plan_id, sort)
);

alter table legacy_plans enable row level security;
alter table legacy_obligation_template enable row level security;
alter table legacy_obligations enable row level security;

do $$ begin
  drop policy if exists legacy_plans_read on legacy_plans;
  drop policy if exists legacy_plans_write on legacy_plans;
  create policy legacy_plans_read on legacy_plans for select using (app_level() >= 3);
  create policy legacy_plans_write on legacy_plans for all using (app_level() >= 4) with check (app_level() >= 4);

  drop policy if exists legacy_template_read on legacy_obligation_template;
  create policy legacy_template_read on legacy_obligation_template for select using (app_level() >= 3);

  drop policy if exists legacy_obligations_read on legacy_obligations;
  drop policy if exists legacy_obligations_write on legacy_obligations;
  create policy legacy_obligations_read on legacy_obligations for select using (app_level() >= 3);
  create policy legacy_obligations_write on legacy_obligations for all using (app_level() >= 3) with check (app_level() >= 3);
end $$;

-- ===== Standard obligations (from the SHSS Legacy Agreement Transition-In Plan & Milestone Tracker) =====
insert into legacy_obligation_template (sort, stage, obligation, reference) values
  (1,  '30-day', 'Facilitates and actively participates in planning for children and youth in the care setting, including the service, care and support plans, Care Circle, monthly check-ins and collaboration with the Director.', 'Schedule B 4.2, 4.3; Schedule C'),
  (2,  '30-day', 'Meets the Key Service Requirements.', 'Schedule B'),
  (3,  '30-day', 'Has the necessary technology to perform the services.', null),
  (4,  '30-day', 'Uses the Specialized Services Portal as set out in the user guides and policies.', null),
  (5,  '30-day', 'Meets the Standards of Care.', 'SHSS Service Provider Policy, section 7'),
  (6,  '30-day', 'Care setting meets the size and quality requirements.', 'Schedule B; Environment of Care Checklist'),
  (7,  '30-day', 'Physical environment meets the Environment of Care Checklist.', 'Policies and Environment of Care Checklist'),
  (8,  '30-day', 'Transportation and vehicle safety meet the Environment of Care Checklist.', 'Policies and Environment of Care Checklist'),
  (9,  '30-day', 'Fulfils the Schedule D Personnel Requirements. If In Progress, give the staffing model, actions and 90-day target dates. Notify the contract manager by email (cc the CMTT mailbox) as unfilled supervisory or clinical positions are filled.', 'Schedule D'),
  (10, '30-day', 'Personnel and any subcontractors meet expectations and perform their duties.', 'Schedule D (Expectations / Potential Duties)'),
  (11, '30-day', 'Personnel and any subcontractors have the qualifications and training. Include actions for gaps, 90-day target dates and the Director''s approval.', 'Schedule D'),
  (12, '30-day', 'Complies with reporting: Specialized Services Portal, Daily Logs, monthly check-in, Reportable Incident Reporting and Complaints Reporting.', 'Policies and Agreement; Appendices H and I'),
  (13, '30-day', 'Retains subcontractors needed for Supplemental Services and Clinical Consultation, following the standards.', 'Appendices E and G'),
  (14, '30-day', 'Follows Clinical Consultation and clinical supervision standards, and provides them when needed.', 'Appendix G'),
  (15, '30-day', 'Supplemental Supports are available as required and aligned with the Policies and Standards.', 'Policies and Standards'),
  (16, '60-day', 'Transition-In Plan approved by the Director within 60 days of the Effective Date.', 'Transition-In Plan process, Step 3'),
  (17, '90-day updates', 'Written status update submitted to the Director (initial, then every 90 days) with the progress on each In Progress item.', 'Transition-In Plan process, Steps 4 and 5'),
  (18, '90-day updates', 'Status update meeting held with the Director; meeting notes recorded in the plan.', 'Transition-In Plan process, Steps 4 and 5'),
  (19, '90-day updates', 'Continuous Improvement Plan completed on the template in the Policies and Standards (initial 90-day update).', 'Schedule B 8.2; Appendix L'),
  (20, '90-day updates', 'Staffing compliance plan reviewed at each update. Any extra 90 days needs written Director approval and a new 90-day target date.', 'Schedule D'),
  (21, '12-month', 'Pays Service Provider Personnel wages under the Operational Cost Structure, or shows progress with 90-day target dates.', 'Schedule F 4.3 (Fees and Payment Model)'),
  (22, '12-month', 'Employs Personnel under the Staffing Model in Schedule D, or shows progress toward it within the term.', 'Schedule D'),
  (23, '12-month', 'Personnel and any subcontractors meet expectations and perform their duties as set out in Schedule D.', 'Schedule D'),
  (24, '12-month', 'Complies with annual and financial reporting on the reporting schedule.', 'Policies and Standards'),
  (25, '12-month', 'Final review of all obligations. Written confirmation of compliance sent to the Director one week before the term ends, then final sign-off. Obligations that survive the term are listed in the plan.', 'Transition-In Plan final approval')
on conflict (sort) do nothing;

-- Start a new legacy plan from the standard obligations. Director of Operations+ (level 4) only.
create or replace function create_legacy_plan(p_name text, p_address text default null, p_service_type text default null,
  p_agreement_number text default null, p_effective_date date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if app_level() < 4 then raise exception 'Only a Director of Operations or above can start a legacy transition plan.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the care setting a name.'; end if;

  insert into legacy_plans (care_setting_name, care_setting_address, shss_service_type, agreement_number, effective_date,
                            term_end_date, status)
  values (trim(p_name), nullif(trim(p_address), ''), p_service_type, nullif(trim(p_agreement_number), ''), p_effective_date,
          case when p_effective_date is null then null else (p_effective_date + interval '12 months' - interval '1 day')::date end,
          'Draft')
  returning id into new_id;

  insert into legacy_obligations (plan_id, sort, stage, obligation, reference)
  select new_id, t.sort, t.stage, t.obligation, t.reference from legacy_obligation_template t order by t.sort;

  return new_id;
end $$;
grant execute on function create_legacy_plan(text, text, text, text, date) to authenticated;

select 'legacy transition plan ready' as result;
