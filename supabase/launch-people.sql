-- =====================================================================
-- Evergreen CRM - Launch plans, pre-opening documents, probation,
-- career ladder, perks and promotions.
-- Run once in Supabase -> SQL Editor (after access-levels.sql and staff-groups.sql).
-- Safe to run again.
-- Pages: /launch, /probation, /careers
-- =====================================================================

create table if not exists launch_plans (
  id uuid primary key default gen_random_uuid(),
  service_type text not null check (service_type in
    ('Emergency Care','Low-Barrier Short-Term Stabilization Care','Respite Care','Specialized Long-Term Care')),
  care_setting_name text,
  care_setting_address text,
  cfr_number text,
  contract_number text,          -- leave blank until contract signed
  contract_effective_date date,  -- leave blank until contract signed
  submitted_by text,
  submission_date date,
  goals text, assumptions text, risks text, risk_actions text, other_notes text,
  transition_days int check (transition_days is null or transition_days <= 90),
  max_staffing numeric, max_facility numeric, max_supplemental numeric,
  payment_option text check (payment_option in ('Option 1','Option 2')),
  status text not null default 'Draft' check (status in ('Draft','Submitted','Contract signed','In progress','Complete')),
  created_at timestamptz default now()
);

create table if not exists launch_milestones (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references launch_plans(id) on delete cascade,
  number int not null check (number between 1 and 12),
  title text not null,
  proposed_days int,
  deliverable text,
  completed_on date,             -- 'Actual date of completion'
  owner_id uuid references profiles(id),
  notes text,
  unique (plan_id, number)
);

create table if not exists launch_tasks (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references launch_milestones(id) on delete cascade,
  sort int not null,
  task text not null,
  is_heading boolean default false,  -- e.g. 'Installation of safety systems:'
  proposed_days int,
  completed_on date,
  owner_id uuid references profiles(id)
);

-- Access: Governance-level work. Level 3+ can see, level 4+ can edit.
-- Uses the app_level() function from access-levels.sql.
alter table launch_plans enable row level security;
alter table launch_milestones enable row level security;
alter table launch_tasks enable row level security;
do $$ declare t text; begin
  foreach t in array array['launch_plans','launch_milestones','launch_tasks'] loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_read on %I for select using (app_level() >= 3)', t, t);
    -- Plan details: Director of Operations+ (4). Milestones and tasks: Program Manager+ (3) can tick off.
    execute format('create policy %I_write on %I for all using (app_level() >= %s) with check (app_level() >= %s)', t, t,
                   case when t = 'launch_plans' then 4 else 3 end, case when t = 'launch_plans' then 4 else 3 end);
  end loop; end $$;

-- ===== Seed: draft plans from the Appendix E spreadsheets =====

-- Specialized Long-Term Care  (from Appendix_E___Transition-In_Plan_Template_ID_159057_V2__1_.xlsx)
with p as (insert into launch_plans (service_type, care_setting_name, care_setting_address, submitted_by, submission_date, goals, assumptions, risks, risk_actions, other_notes, transition_days, max_staffing, max_facility, max_supplemental, payment_option)
  select 'Specialized Long-Term Care', null, null, 'Melvin Mohan', '2026-04-08', '1. Secure a suitable Care Setting compliant with safety, licensing, and program standards.
2.Recruit, onboard, and train staff to meet program needs.
3.Establish partnerships with local Indigenous and social sector organizations.
4.Inform and integrate with the local community, including police, schools, and health services.
5.Ensure operational readiness for children and youth services by the end of the Transition-In Period.', '1.Contract award within weeks from submission.
2.Facilities meeting standards will be available for lease or purchase.
3.Recruitment of qualified staff is feasible within the proposed timeline.
4.Local community and partners are willing to engage.
5.Licensing and regulatory approvals will not be delayed beyond expected timelines.', '1.Delays in securing facility
2.Difficulty recruiting qualified staff
3.Licensing or regulatory delays
4.Low partner engagement
5.Community concerns', '1.Maintain multiple facility options; early engagement with owners
2.Early recruitment campaigns, staffing agencies, competitive incentives
3.Submit applications immediately, maintain follow-up
4.Formal agreements, early meetings, consistent communication
5.Community information sessions, transparent communication', 'This timeline reflects a structured and phased approach to securing a suitable care setting, completing staffing, training, compliance requirements, and establishing operational systems in alignment with the SHSS Service Provider Operational Policy and Schedule F.', null, 30, 30, 40, 'Option 1' where not exists (select 1 from launch_plans where service_type = 'Specialized Long-Term Care') returning id)
, m as (insert into launch_milestones (plan_id, number, title, proposed_days, deliverable) select p.id, v.n, v.t, v.d, v.dl from p, (values
  (1, 'Contract Award, Governance & Mobilization', 30::int, 'Approved Transition-In workplan and governance structure'),
  (2, 'Care Setting Identification & Due Diligence', 45::int, 'Documented property assessment and preferred site selection'),
  (3, 'Lease Finalization & Compliance Readiness', 30::int, 'Signed lease and compliance confirmation'),
  (4, 'Care Setting Preparation & Safety Compliance', 45::int, 'Completed Environment of Care readiness checklist'),
  (5, 'Recruitment Strategy Activation', 40::int, 'Active candidate pool with screened applicants'),
  (6, 'Staffing Selection & Conditional Hiring', null::int, 'Confirmed staffing roster (conditional)'),
  (7, 'Credentialing, Screening & Hub Clearances', null::int, 'Cleared and approved staff ready for onboarding'),
  (8, 'Staff Onboarding & Role Integration', 45::int, 'Fully onboarded staff team with defined roles'),
  (9, 'Training, Certification & Practice Readiness', 45::int, 'Staff fully trained and certified'),
  (10, 'Operational Systems & Infrastructure Setup', 45::int, 'Fully functional operational and reporting systems'),
  (11, 'Community Integration & Indigenous Engagement', 45::int, 'Established partnerships and documented engagement plan'),
  (12, 'Final Readiness, Quality Assurance & Service Commencement', 45::int, 'Program fully operational and accepting clients')
) v(n,t,d,dl) returning id, number)
insert into launch_tasks (milestone_id, sort, task, is_heading, proposed_days) select m.id, v.s, v.t, v.h, v.d from m join (values
  (1, 1, 'Formal contract execution and internal authorization to proceed', false, 30::int),
  (1, 2, 'Appointment of a Transition-In Lead (Program Manager level or above) with clear accountability', false, 30::int),
  (1, 3, 'Establishment of a Transition Governance Structure (HR, Operations, Clinical/Practice Lead, Finance)', false, 30::int),
  (1, 4, 'Development of a detailed Transition-In workplan aligned to Schedule K', false, 30::int),
  (1, 5, 'Initial meeting with MCFD to confirm expectations, communication protocols, and reporting structure', false, 30::int),
  (2, 1, 'Identification of multiple property options to mitigate risk', false, 45::int),
  (2, 2, 'Assessment against Environment of Care Checklist (Appendix D)', false, 45::int),
  (2, 3, 'Review of proximity to schools, health services, and community supports', false, 45::int),
  (2, 4, 'Preliminary safety, zoning, and neighborhood suitability review', false, 45::int),
  (3, 1, 'Execution of lease or acquisition agreement', false, 30::int),
  (3, 2, 'Initiation of property insurance (liability, contents, risk coverage)', false, 30::int),
  (3, 3, 'Confirmation of compliance with municipal bylaws and occupancy standards', false, 30::int),
  (4, 1, 'Full furnishing of residence (bedrooms, common areas, staff workspace)', false, 45::int),
  (4, 2, 'Installation of safety systems:', true, null::int),
  (4, 3, 'Fire extinguishers, smoke detectors, emergency exits', false, 45::int),
  (4, 4, 'Medication storage and controlled access systems', false, 45::int),
  (4, 5, 'Setup aligned with trauma-informed, youth-friendly environment', false, 45::int),
  (4, 6, 'Internal inspection to ensure full compliance with MCFD standards', false, 45::int),
  (5, 1, 'Deployment of targeted recruitment strategy (Indeed, regional outreach, internal staffing pool)', false, 40::int),
  (5, 2, 'Prioritization of candidates meeting Schedule D qualifications', false, 40::int),
  (5, 3, 'Use of structured screening tools (pre-screen forms, behavioral interviews)', false, 40::int),
  (5, 4, 'Active recruitment in rural and underserved regions (if applicable)', false, 40::int),
  (6, 1, 'Selection of qualified candidates aligned with program needs and client complexity', false, 45::int),
  (6, 2, 'Issuance of conditional offers subject to clearances', false, 45::int),
  (6, 3, 'Staffing model designed to ensure 24/7 coverage, consistency, and retention', false, 45::int),
  (6, 4, 'Inclusion of experienced staff for mentorship and program stability', false, 45::int),
  (6, 5, 'Centralized Hub to process clearences 30- 45 days', false, null::int),
  (7, 1, 'Collection and verification of:', true, null::int),
  (7, 2, 'Criminal Record Checks (CRC/CRRA)', false, 30::int),
  (7, 3, 'References, education, and certifications', false, 15::int),
  (7, 4, 'Driver’s license and insurance (where applicable)', false, 15::int),
  (7, 5, 'Submission of required documentation to MCFD Hub (SRAT process)', false, 15::int),
  (7, 6, 'Centralized tracking to ensure no onboarding gaps', false, 15::int),
  (7, 7, 'Basic Training as per SHSS policy', false, 30::int),
  (8, 1, 'Completion of employment agreements and documentation', false, 45::int),
  (8, 2, 'Delivery of structured onboarding program:', true, null::int),
  (8, 3, 'Organizational values and expectations', false, 45::int),
  (8, 4, 'Roles, responsibilities, and reporting structure', false, 45::int),
  (8, 5, 'Assignment of staff to consistent shifts to promote stability for youth', false, 45::int),
  (9, 1, 'Completion of mandatory certifications:', true, null::int),
  (9, 2, 'CPI/Mandt (crisis prevention and intervention)', false, 45::int),
  (9, 3, 'First Aid & CPR', false, 45::int),
  (9, 4, 'Delivery of advanced training:', true, null::int),
  (9, 5, 'Trauma-informed practice', false, 45::int),
  (9, 6, 'Cultural safety and UNDRIP-aligned approaches', false, 45::int),
  (9, 7, 'De-escalation and crisis response planning', false, 45::int),
  (9, 8, 'Supervisor training on oversight, documentation, and incident response', false, 45::int),
  (10, 1, 'Implementation of operational systems:', true, null::int),
  (10, 2, 'ShareVision (documentation and reporting)/Evergreen Cloud Portal', false, 45::int),
  (10, 3, 'Microsoft 365 / Teams (communication and file security)', false, 45::int),
  (10, 4, 'HR tracking systems (credentials, scheduling)', false, 45::int),
  (10, 5, 'Development of program-specific documentation:', true, null::int),
  (10, 6, 'Incident reporting protocols', false, 45::int),
  (10, 7, 'Daily logs and service plans', false, 45::int),
  (10, 8, 'Establishment of communication protocols (internal and with MCFD)', false, 45::int),
  (11, 1, 'Early and ongoing engagement with local Indigenous communities and organizations', false, 45::int),
  (11, 2, 'Collaboration with:', true, null::int),
  (11, 3, 'MCFD resource workers', false, 45::int),
  (11, 4, 'CYMH clinicians', false, 45::int),
  (11, 5, 'Schools and educational partners', false, 45::int),
  (11, 6, 'RCMP and emergency services', false, 45::int),
  (11, 7, 'Development of Care Circle approach to support integrated service delivery', false, 45::int),
  (11, 8, 'Inclusion of culturally appropriate practices and supports', false, 45::int),
  (12, 1, 'Final internal audit to ensure compliance across all domains', false, 45::int),
  (12, 2, 'Confirmation of:', true, null::int),
  (12, 3, 'Staffing readiness', false, 45::int),
  (12, 4, 'Property compliance', false, 45::int),
  (12, 5, 'Operational systems functionality', false, 45::int),
  (12, 6, 'Completion of risk assessment and mitigation review', false, 45::int),
  (12, 7, 'Formal notification to MCFD of readiness', false, 45::int),
  (12, 8, 'Intake process initiated and service delivery begins', false, 45::int)
) v(n,s,t,h,d) on v.n = m.number;

-- Low-Barrier Short-Term Stabilization Care  (from Appendix_E___Transition-In_Plan_Template_ID_159058_V2_-_Copy.xlsx)
with p as (insert into launch_plans (service_type, care_setting_name, care_setting_address, submitted_by, submission_date, goals, assumptions, risks, risk_actions, other_notes, transition_days, max_staffing, max_facility, max_supplemental, payment_option)
  select 'Low-Barrier Short-Term Stabilization Care', null, null, 'Melvin Mohan', '2026-03-27', '1. Secure a suitable Care Setting compliant with safety, licensing, and program standards.
2.Recruit, onboard, and train staff to meet program needs.
3.Establish partnerships with local Indigenous and social sector organizations.
4.Inform and integrate with the local community, including police, schools, and health services.
5.Ensure operational readiness for children and youth services by the end of the Transition-In Period.', '1.Contract award within weeks from submission.
2.Facilities meeting standards will be available for lease or purchase.
3.Recruitment of qualified staff is feasible within the proposed timeline.
4.Local community and partners are willing to engage.
5.Licensing and regulatory approvals will not be delayed beyond expected timelines.', '1.Delays in securing facility
2.Difficulty recruiting qualified staff
3.Licensing or regulatory delays
4.Low partner engagement
5.Community concerns', '1.Maintain multiple facility options; early engagement with owners
2.Early recruitment campaigns, staffing agencies, competitive incentives
3.Submit applications immediately, maintain follow-up
4.Formal agreements, early meetings, consistent communication
5.Community information sessions, transparent communication', 'This timeline reflects a structured and phased approach to securing a suitable care setting, completing staffing, training, compliance requirements, and establishing operational systems in alignment with the SHSS Service Provider Operational Policy and Schedule F.', 90, 30, 30, 40, 'Option 1' where not exists (select 1 from launch_plans where service_type = 'Low-Barrier Short-Term Stabilization Care') returning id)
, m as (insert into launch_milestones (plan_id, number, title, proposed_days, deliverable) select p.id, v.n, v.t, v.d, v.dl from p, (values
  (1, 'Contract Award, Governance & Mobilization', 30::int, 'Approved Transition-In workplan and governance structure'),
  (2, 'Care Setting Identification & Due Diligence', 30::int, 'Documented property assessment and preferred site selection'),
  (3, 'Lease Finalization & Compliance Readiness', 30::int, 'Signed lease and compliance confirmation'),
  (4, 'Care Setting Preparation & Safety Compliance', 30::int, 'Completed Environment of Care readiness checklist'),
  (5, 'Recruitment Strategy Activation', null::int, 'Active candidate pool with screened applicants'),
  (6, 'Staffing Selection & Conditional Hiring', 45::int, 'Confirmed staffing roster (conditional)'),
  (7, 'Credentialing, Screening & Hub Clearances', 30::int, 'Cleared and approved staff ready for onboarding'),
  (8, 'Staff Onboarding & Role Integration', 15::int, 'Fully onboarded staff team with defined roles'),
  (9, 'Training, Certification & Practice Readiness', 30::int, 'Staff fully trained and certified'),
  (10, 'Operational Systems & Infrastructure Setup', 30::int, 'Fully functional operational and reporting systems'),
  (11, 'Community Integration & Indigenous Engagement', 45::int, 'Established partnerships and documented engagement plan'),
  (12, 'Final Readiness, Quality Assurance & Service Commencement', 30::int, 'Program fully operational and accepting clients')
) v(n,t,d,dl) returning id, number)
insert into launch_tasks (milestone_id, sort, task, is_heading, proposed_days) select m.id, v.s, v.t, v.h, v.d from m join (values
  (1, 1, 'Formal contract execution and internal authorization to proceed', false, 30::int),
  (1, 2, 'Appointment of a Transition-In Lead (Program Manager level or above) with clear accountability', false, 30::int),
  (1, 3, 'Establishment of a Transition Governance Structure (HR, Operations, Clinical/Practice Lead, Finance)', false, 30::int),
  (1, 4, 'Development of a detailed Transition-In workplan aligned to Schedule K', false, 30::int),
  (1, 5, 'Initial meeting with MCFD to confirm expectations, communication protocols, and reporting structure', false, 30::int),
  (2, 1, 'Identification of multiple property options to mitigate risk', false, 30::int),
  (2, 2, 'Assessment against Environment of Care Checklist (Appendix D)', false, 30::int),
  (2, 3, 'Review of proximity to schools, health services, and community supports', false, 30::int),
  (2, 4, 'Preliminary safety, zoning, and neighborhood suitability review', false, 30::int),
  (3, 1, 'Execution of lease or acquisition agreement', false, 30::int),
  (3, 2, 'Initiation of property insurance (liability, contents, risk coverage)', false, 30::int),
  (3, 3, 'Confirmation of compliance with municipal bylaws and occupancy standards', false, 30::int),
  (4, 1, 'Full furnishing of residence (bedrooms, common areas, staff workspace)', false, 30::int),
  (4, 2, 'Installation of safety systems:', true, null::int),
  (4, 3, 'Fire extinguishers, smoke detectors, emergency exits', false, 30::int),
  (4, 4, 'Medication storage and controlled access systems', false, 30::int),
  (4, 5, 'Setup aligned with trauma-informed, youth-friendly environment', false, 30::int),
  (4, 6, 'Internal inspection to ensure full compliance with MCFD standards', false, null::int),
  (5, 1, 'Deployment of targeted recruitment strategy (Indeed, regional outreach, internal staffing pool)', false, 30::int),
  (5, 2, 'Prioritization of candidates meeting Schedule D qualifications', false, 30::int),
  (5, 3, 'Use of structured screening tools (pre-screen forms, behavioral interviews)', false, 30::int),
  (5, 4, 'Active recruitment in rural and underserved regions (if applicable)', false, 30::int),
  (6, 1, 'Selection of qualified candidates aligned with program needs and client complexity', false, 45::int),
  (6, 2, 'Issuance of conditional offers subject to clearances', false, 45::int),
  (6, 3, 'Staffing model designed to ensure 24/7 coverage, consistency, and retention', false, 45::int),
  (6, 4, 'Inclusion of experienced staff for mentorship and program stability', false, 45::int),
  (6, 5, 'Centralized Hub to process clearences 30- 45 days', false, null::int),
  (7, 1, 'Collection and verification of:', true, null::int),
  (7, 2, 'Criminal Record Checks (CRC/CRRA)', false, 30::int),
  (7, 3, 'References, education, and certifications', false, 15::int),
  (7, 4, 'Driver’s license and insurance (where applicable)', false, 15::int),
  (7, 5, 'Submission of required documentation to MCFD Hub (SRAT process)', false, 15::int),
  (7, 6, 'Centralized tracking to ensure no onboarding gaps', false, 15::int),
  (8, 1, 'Completion of employment agreements and documentation', false, 15::int),
  (8, 2, 'Delivery of structured onboarding program:', true, null::int),
  (8, 3, 'Organizational values and expectations', false, 15::int),
  (8, 4, 'Roles, responsibilities, and reporting structure', false, 15::int),
  (8, 5, 'Assignment of staff to consistent shifts to promote stability for youth', false, 15::int),
  (9, 1, 'Completion of mandatory certifications:', true, null::int),
  (9, 2, 'CPI/Mandt (crisis prevention and intervention)', false, 30::int),
  (9, 3, 'First Aid & CPR', false, 30::int),
  (9, 4, 'Delivery of advanced training:', true, null::int),
  (9, 5, 'Trauma-informed practice', false, 30::int),
  (9, 6, 'Cultural safety and UNDRIP-aligned approaches', false, 30::int),
  (9, 7, 'De-escalation and crisis response planning', false, 30::int),
  (9, 8, 'Supervisor training on oversight, documentation, and incident response', false, 3::int),
  (10, 1, 'Implementation of operational systems:', true, null::int),
  (10, 2, 'ShareVision (documentation and reporting)/Evergreen Cloud Portal', false, 30::int),
  (10, 3, 'Microsoft 365 / Teams (communication and file security)', false, 30::int),
  (10, 4, 'HR tracking systems (credentials, scheduling)', false, 30::int),
  (10, 5, 'Development of program-specific documentation:', true, null::int),
  (10, 6, 'Incident reporting protocols', false, 30::int),
  (10, 7, 'Daily logs and service plans', false, null::int),
  (10, 8, 'Establishment of communication protocols (internal and with MCFD)', false, null::int),
  (11, 1, 'Early and ongoing engagement with local Indigenous communities and organizations', false, null::int),
  (11, 2, 'Collaboration with:', true, null::int),
  (11, 3, 'MCFD resource workers', false, 15::int),
  (11, 4, 'CYMH clinicians', false, 15::int),
  (11, 5, 'Schools and educational partners', false, 15::int),
  (11, 6, 'RCMP and emergency services', false, 15::int),
  (11, 7, 'Development of Care Circle approach to support integrated service delivery', false, 15::int),
  (11, 8, 'Inclusion of culturally appropriate practices and supports', false, 15::int),
  (12, 1, 'Final internal audit to ensure compliance across all domains', false, null::int),
  (12, 2, 'Confirmation of:', true, null::int),
  (12, 3, 'Staffing readiness', false, 30::int),
  (12, 4, 'Property compliance', false, 30::int),
  (12, 5, 'Operational systems functionality', false, 30::int),
  (12, 6, 'Completion of risk assessment and mitigation review', false, 30::int),
  (12, 7, 'Formal notification to MCFD of readiness', false, 30::int),
  (12, 8, 'Intake process initiated and service delivery begins', false, 30::int)
) v(n,s,t,h,d) on v.n = m.number;

-- Respite Care  (from Appendix_E___Transition-In_Plan_Template_ID_159058_V2.xlsx)
with p as (insert into launch_plans (service_type, care_setting_name, care_setting_address, submitted_by, submission_date, goals, assumptions, risks, risk_actions, other_notes, transition_days, max_staffing, max_facility, max_supplemental, payment_option)
  select 'Respite Care', null, null, 'Melvin Mohan', '2026-03-27', '1. Secure a suitable Care Setting compliant with safety, licensing, and program standards.
2.Recruit, onboard, and train staff to meet program needs.
3.Establish partnerships with local Indigenous and social sector organizations.
4.Inform and integrate with the local community, including police, schools, and health services.
5.Ensure operational readiness for children and youth services by the end of the Transition-In Period.', '1.Contract award within weeks from submission.
2.Facilities meeting standards will be available for lease or purchase.
3.Recruitment of qualified staff is feasible within the proposed timeline.
4.Local community and partners are willing to engage.
5.Licensing and regulatory approvals will not be delayed beyond expected timelines.', '1.Delays in securing facility
2.Difficulty recruiting qualified staff
3.Licensing or regulatory delays
4.Low partner engagement
5.Community concerns', '1.Maintain multiple facility options; early engagement with owners
2.Early recruitment campaigns, staffing agencies, competitive incentives
3.Submit applications immediately, maintain follow-up
4.Formal agreements, early meetings, consistent communication
5.Community information sessions, transparent communication', 'This timeline reflects a structured and phased approach to securing a suitable care setting, completing staffing, training, compliance requirements, and establishing operational systems in alignment with the SHSS Service Provider Operational Policy and Schedule F.', 90, 30, 30, 40, 'Option 1' where not exists (select 1 from launch_plans where service_type = 'Respite Care') returning id)
, m as (insert into launch_milestones (plan_id, number, title, proposed_days, deliverable) select p.id, v.n, v.t, v.d, v.dl from p, (values
  (1, 'Contract Award, Governance & Mobilization', 30::int, 'Approved Transition-In workplan and governance structure'),
  (2, 'Care Setting Identification & Due Diligence', 30::int, 'Documented property assessment and preferred site selection'),
  (3, 'Lease Finalization & Compliance Readiness', 30::int, 'Signed lease and compliance confirmation'),
  (4, 'Care Setting Preparation & Safety Compliance', 30::int, 'Completed Environment of Care readiness checklist'),
  (5, 'Recruitment Strategy Activation', null::int, 'Active candidate pool with screened applicants'),
  (6, 'Staffing Selection & Conditional Hiring', 45::int, 'Confirmed staffing roster (conditional)'),
  (7, 'Credentialing, Screening & Hub Clearances', 30::int, 'Cleared and approved staff ready for onboarding'),
  (8, 'Staff Onboarding & Role Integration', 15::int, 'Fully onboarded staff team with defined roles'),
  (9, 'Training, Certification & Practice Readiness', 30::int, 'Staff fully trained and certified'),
  (10, 'Operational Systems & Infrastructure Setup', 30::int, 'Fully functional operational and reporting systems'),
  (11, 'Community Integration & Indigenous Engagement', 45::int, 'Established partnerships and documented engagement plan'),
  (12, 'Final Readiness, Quality Assurance & Service Commencement', 30::int, 'Program fully operational and accepting clients')
) v(n,t,d,dl) returning id, number)
insert into launch_tasks (milestone_id, sort, task, is_heading, proposed_days) select m.id, v.s, v.t, v.h, v.d from m join (values
  (1, 1, 'Formal contract execution and internal authorization to proceed', false, 30::int),
  (1, 2, 'Appointment of a Transition-In Lead (Program Manager level or above) with clear accountability', false, 30::int),
  (1, 3, 'Establishment of a Transition Governance Structure (HR, Operations, Clinical/Practice Lead, Finance)', false, 30::int),
  (1, 4, 'Development of a detailed Transition-In workplan aligned to Schedule K', false, 30::int),
  (1, 5, 'Initial meeting with MCFD to confirm expectations, communication protocols, and reporting structure', false, 30::int),
  (2, 1, 'Identification of multiple property options to mitigate risk', false, 30::int),
  (2, 2, 'Assessment against Environment of Care Checklist (Appendix D)', false, 30::int),
  (2, 3, 'Review of proximity to schools, health services, and community supports', false, 30::int),
  (2, 4, 'Preliminary safety, zoning, and neighborhood suitability review', false, 30::int),
  (3, 1, 'Execution of lease or acquisition agreement', false, 30::int),
  (3, 2, 'Initiation of property insurance (liability, contents, risk coverage)', false, 30::int),
  (3, 3, 'Confirmation of compliance with municipal bylaws and occupancy standards', false, 30::int),
  (4, 1, 'Full furnishing of residence (bedrooms, common areas, staff workspace)', false, 30::int),
  (4, 2, 'Installation of safety systems:', true, null::int),
  (4, 3, 'Fire extinguishers, smoke detectors, emergency exits', false, 30::int),
  (4, 4, 'Medication storage and controlled access systems', false, 30::int),
  (4, 5, 'Setup aligned with trauma-informed, youth-friendly environment', false, 30::int),
  (4, 6, 'Internal inspection to ensure full compliance with MCFD standards', false, null::int),
  (5, 1, 'Deployment of targeted recruitment strategy (Indeed, regional outreach, internal staffing pool)', false, 30::int),
  (5, 2, 'Prioritization of candidates meeting Schedule D qualifications', false, 30::int),
  (5, 3, 'Use of structured screening tools (pre-screen forms, behavioral interviews)', false, 30::int),
  (5, 4, 'Active recruitment in rural and underserved regions (if applicable)', false, 30::int),
  (6, 1, 'Selection of qualified candidates aligned with program needs and client complexity', false, 45::int),
  (6, 2, 'Issuance of conditional offers subject to clearances', false, 45::int),
  (6, 3, 'Staffing model designed to ensure 24/7 coverage, consistency, and retention', false, 45::int),
  (6, 4, 'Inclusion of experienced staff for mentorship and program stability', false, 45::int),
  (6, 5, 'Centralized Hub to process clearences 30- 45 days', false, null::int),
  (7, 1, 'Collection and verification of:', true, null::int),
  (7, 2, 'Criminal Record Checks (CRC/CRRA)', false, 30::int),
  (7, 3, 'References, education, and certifications', false, 15::int),
  (7, 4, 'Driver’s license and insurance (where applicable)', false, 15::int),
  (7, 5, 'Submission of required documentation to MCFD Hub (SRAT process)', false, 15::int),
  (7, 6, 'Centralized tracking to ensure no onboarding gaps', false, 15::int),
  (8, 1, 'Completion of employment agreements and documentation', false, 15::int),
  (8, 2, 'Delivery of structured onboarding program:', true, null::int),
  (8, 3, 'Organizational values and expectations', false, 15::int),
  (8, 4, 'Roles, responsibilities, and reporting structure', false, 15::int),
  (8, 5, 'Assignment of staff to consistent shifts to promote stability for youth', false, 15::int),
  (9, 1, 'Completion of mandatory certifications:', true, null::int),
  (9, 2, 'CPI/Mandt (crisis prevention and intervention)', false, 30::int),
  (9, 3, 'First Aid & CPR', false, 30::int),
  (9, 4, 'Delivery of advanced training:', true, null::int),
  (9, 5, 'Trauma-informed practice', false, 30::int),
  (9, 6, 'Cultural safety and UNDRIP-aligned approaches', false, 30::int),
  (9, 7, 'De-escalation and crisis response planning', false, 30::int),
  (9, 8, 'Supervisor training on oversight, documentation, and incident response', false, 3::int),
  (10, 1, 'Implementation of operational systems:', true, null::int),
  (10, 2, 'ShareVision (documentation and reporting)/Evergreen Cloud Portal', false, 30::int),
  (10, 3, 'Microsoft 365 / Teams (communication and file security)', false, 30::int),
  (10, 4, 'HR tracking systems (credentials, scheduling)', false, 30::int),
  (10, 5, 'Development of program-specific documentation:', true, null::int),
  (10, 6, 'Incident reporting protocols', false, 30::int),
  (10, 7, 'Daily logs and service plans', false, null::int),
  (10, 8, 'Establishment of communication protocols (internal and with MCFD)', false, null::int),
  (11, 1, 'Early and ongoing engagement with local Indigenous communities and organizations', false, null::int),
  (11, 2, 'Collaboration with:', true, null::int),
  (11, 3, 'MCFD resource workers', false, 15::int),
  (11, 4, 'CYMH clinicians', false, 15::int),
  (11, 5, 'Schools and educational partners', false, 15::int),
  (11, 6, 'RCMP and emergency services', false, 15::int),
  (11, 7, 'Development of Care Circle approach to support integrated service delivery', false, 15::int),
  (11, 8, 'Inclusion of culturally appropriate practices and supports', false, 15::int),
  (12, 1, 'Final internal audit to ensure compliance across all domains', false, null::int),
  (12, 2, 'Confirmation of:', true, null::int),
  (12, 3, 'Staffing readiness', false, 30::int),
  (12, 4, 'Property compliance', false, 30::int),
  (12, 5, 'Operational systems functionality', false, 30::int),
  (12, 6, 'Completion of risk assessment and mitigation review', false, 30::int),
  (12, 7, 'Formal notification to MCFD of readiness', false, 30::int),
  (12, 8, 'Intake process initiated and service delivery begins', false, 30::int)
) v(n,s,t,h,d) on v.n = m.number;
-- =====================================================================
-- STAFF PERKS & PROMOTION (Total Rewards) — launch version
-- Research basis: DSP surveys show ~78% would stay longer with a real
-- advancement program; recognition from a supervisor (mostly 1:1, private)
-- matters to ~76%. Consistent scheduling and paid training reduce turnover.
-- Pay amounts are left for Evergreen to set — fill in pay_note.
-- =====================================================================

create table if not exists career_ladder (
  step int primary key,
  title text not null,
  staff_group text not null,      -- matches Evergreen staff groups
  min_months int not null,        -- time at Evergreen before eligible
  requirements text not null,     -- what must be true (CRM can check most of it)
  unlocks text,                   -- perks / responsibilities gained
  pay_note text                   -- Evergreen fills in the rate or step
);

create table if not exists staff_perks (
  id serial primary key,
  category text not null check (category in ('Recognition','Growth','Schedule','Wellbeing','Pay','Practical')),
  perk text not null unique,
  who_gets_it text not null,
  phase text not null check (phase in ('At launch','After 6 months','Year 1+')),
  cost text not null check (cost in ('Free','Low','Medium')),
  how_crm_tracks_it text
);

create table if not exists staff_promotions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles(id),
  from_step int references career_ladder(step),
  to_step int not null references career_ladder(step),
  status text not null default 'Requested' check (status in ('Requested','Recommended','Approved','Declined')),
  evidence text,
  recommended_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  decided_on date,
  created_at timestamptz default now()
);

alter table career_ladder enable row level security;
alter table staff_perks enable row level security;
alter table staff_promotions enable row level security;
drop policy if exists ladder_read on career_ladder;
drop policy if exists ladder_write on career_ladder;
drop policy if exists perks_read on staff_perks;
drop policy if exists perks_write on staff_perks;
drop policy if exists promo_read on staff_promotions;
drop policy if exists promo_request on staff_promotions;
drop policy if exists promo_manage on staff_promotions;
-- Everyone can see the ladder and perks (that's the point — staff should see the path).
create policy ladder_read on career_ladder for select using (auth.uid() is not null);
create policy ladder_write on career_ladder for all using (app_level() >= 4) with check (app_level() >= 4);
create policy perks_read on staff_perks for select using (auth.uid() is not null);
create policy perks_write on staff_perks for all using (app_level() >= 4) with check (app_level() >= 4);
-- Staff see and request their own promotion; Program Manager+ see and decide all.
create policy promo_read on staff_promotions for select using (staff_id = auth.uid() or app_level() >= 3);
create policy promo_request on staff_promotions for insert with check ((staff_id = auth.uid() and status = 'Requested') or app_level() >= 3);
create policy promo_manage on staff_promotions for update using (app_level() >= 3 and staff_id <> auth.uid()) with check (app_level() >= 3);

insert into career_ladder values
 (1,'Support Worker I','Frontline',0,
  'Onboarding complete; criminal record check cleared; First Aid/CPR and CPI/Mandt current; probation passed (30/90/120-day reviews) and confirmed full-time.',
  'Benefits after probation; paid mandatory training; buddy/mentor assigned.',
  'Base rate — Evergreen to set'),
 (2,'Support Worker II','Frontline',6,
  'All mandatory training current; trauma-informed practice + cultural safety (UNDRIP) training done; 95%+ shift notes signed on time; medication documentation accurate; no open performance plan; supervisor recommends.',
  'Pay step increase; priority on extra shift pick-ups.',
  'Step 2 — Evergreen to set'),
 (3,'Senior / Lead Support Worker','Frontline',12,
  'Support Worker II for 6+ months; supervisor/shift-lead training done; mentored at least one new hire through 90 days; incident reports complete and on time; two positive supervision reviews.',
  'Shift-lead premium; mentor role; first look at Program Coordinator postings; acting-PC shifts.',
  'Step 3 + shift-lead premium — Evergreen to set'),
 (4,'Program Coordinator','Program Coordinators',18,
  'Lead Support Worker for 6+ months (or equivalent experience); completed acting-PC shifts; house KPIs mostly green during acting period; incident review and care-plan writing training done; interview with Program Manager.',
  'Salary band; owns house KPIs (meds, care plans, drills, documentation); leadership training budget.',
  'Coordinator band — Evergreen to set'),
 (5,'Program Manager','Program Managers',36,
  'Program Coordinator 12+ months with house KPIs green; diploma/degree in CYC, social work or related (or Evergreen-supported study in progress); MCFD/CLBC standards training; interview with Director of Operations.',
  'Manager band; multi-house responsibility; owns incidents, shift coverage, staff-on-duty KPIs.',
  'Manager band — Evergreen to set'),
 (6,'Director of Operations and above','Director of Operations',60,
  'By posting and executive interview.',
  'Executive KPI ownership.',
  'Executive — set by CEO')
on conflict (step) do nothing;

update career_ladder set requirements = replace(requirements, 'probation review passed at 90 days.', 'probation passed (30/90/120-day reviews) and confirmed full-time.') where step = 1;

-- ---------------------------------------------------------------------
-- MANAGEMENT PROMOTIONS: 24-month wait + reviews + Board of Directors decision
-- Applies to Program Coordinator and above (steps 4–6).
-- ---------------------------------------------------------------------
alter table career_ladder add column if not exists requires_board boolean not null default false;
update career_ladder set requires_board = true, min_months = greatest(min_months, 24) where step >= 4;
update career_ladder set requirements = requirements ||
  ' MANAGEMENT RULE: at least 24 months at Evergreen; at least two satisfactory performance reviews in the last 12 months; final decision by the Board of Directors.'
  where step >= 4 and requirements not like '%MANAGEMENT RULE%';

alter table staff_promotions add column if not exists months_at_evergreen int;
alter table staff_promotions add column if not exists satisfactory_reviews int;   -- in last 12 months
alter table staff_promotions add column if not exists board_meeting_date date;
alter table staff_promotions add column if not exists board_reference text;        -- e.g. motion / minutes number
alter table staff_promotions drop constraint if exists staff_promotions_status_check;
alter table staff_promotions add constraint staff_promotions_status_check
  check (status in ('Requested','Recommended','Board review','Approved','Declined'));

create or replace function check_promotion() returns trigger language plpgsql as $$
declare r career_ladder;
begin
  select * into r from career_ladder where step = new.to_step;
  -- Months at Evergreen come from the HR file's hire date when not typed in.
  if new.months_at_evergreen is null then
    select (extract(year from age(current_date, d.hire_date)) * 12 + extract(month from age(current_date, d.hire_date)))::int
      into new.months_at_evergreen from staff_details d where d.profile_id = new.staff_id and d.hire_date is not null;
  end if;
  if r.requires_board then
    if new.status in ('Board review','Approved') then
      if coalesce(new.months_at_evergreen, 0) < r.min_months then
        raise exception 'Management promotion: staff need at least % months at Evergreen (has %).', r.min_months, coalesce(new.months_at_evergreen, 0);
      end if;
      if coalesce(new.satisfactory_reviews, 0) < 2 then
        raise exception 'Management promotion: need at least 2 satisfactory performance reviews in the last 12 months.';
      end if;
    end if;
    if new.status = 'Approved' and (tg_op = 'INSERT' or old.status <> 'Board review') then
      raise exception 'Management promotion must go to Board review before it can be approved.';
    end if;
    -- A Board decision is needed once the request is at Board review (a manager can still decline earlier).
    if new.status in ('Approved','Declined') and tg_op = 'UPDATE' and old.status = 'Board review' then
      if new.board_meeting_date is null or coalesce(new.board_reference, '') = '' then
        raise exception 'Record the Board of Directors meeting date and motion/minutes reference.';
      end if;
      if app_level() < 7 then
        raise exception 'Only the CEO or an Administrator can record a Board decision.';
      end if;
      new.decided_on := coalesce(new.decided_on, new.board_meeting_date);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists promotion_rules on staff_promotions;
create trigger promotion_rules before insert or update on staff_promotions
  for each row execute function check_promotion();

insert into staff_perks (category, perk, who_gets_it, phase, cost, how_crm_tracks_it) values
 ('Recognition','Monthly 1:1 supervision that starts with what went well (private recognition is what most care staff prefer)','Everyone','At launch','Free','Supervision record per staff per month'),
 ('Recognition','"Evergreen Star" peer nomination each month, announced in Teams with a small gift card','Everyone','At launch','Low','Nomination form + monthly winner'),
 ('Recognition','Work anniversary thank-you at 6 months, 1 year, then yearly','Everyone','At launch','Low','Auto-reminder from hire date'),
 ('Growth','Paid mandatory certifications and paid training time (CPI/Mandt, First Aid/CPR, trauma-informed, cultural safety)','Everyone','At launch','Medium','Evergreen Academy training matrix'),
 ('Growth','Clear career ladder posted in the portal; staff can see their next step and request review','Everyone','At launch','Free','career_ladder + staff_promotions'),
 ('Growth','Internal postings shown to staff before going public','Everyone','At launch','Free','Job post flag "internal first"'),
 ('Growth','Mentor/buddy for every new hire through first 90 days','New hires; mentors are Step 3','At launch','Free','Mentor field on onboarding checklist'),
 ('Growth','Tuition / certificate support (e.g. Child & Youth Care) with a return-of-service agreement','Step 2+','Year 1+','Medium','Training request + approval'),
 ('Schedule','Consistent house and shift assignments for stability (staff and youth)','Everyone','At launch','Free','Schedule module'),
 ('Schedule','Schedule posted at least 2 weeks ahead; shift swaps and pick-ups in the CRM','Everyone','At launch','Free','Schedule module'),
 ('Schedule','Overtime watched and shared fairly (40-hour flag already in CRM)','Everyone','At launch','Free','Overtime KPI'),
 ('Wellbeing','Paid debrief after any critical incident','Staff involved','At launch','Low','Linked to incident report'),
 ('Wellbeing','Employee and Family Assistance Program (EFAP)','Everyone','After 6 months','Low','Benefits enrolment'),
 ('Wellbeing','Extended health and dental benefits','Staff past probation','After 6 months','Medium','Benefits enrolment'),
 ('Pay','Shift-lead premium for Step 3 when running a shift','Step 3+','At launch','Low','Timesheet code'),
 ('Pay','Staff referral bonus paid in two parts (on hire and after 90 days)','Everyone','At launch','Low','Referral field on applicant'),
 ('Pay','Retention bonus at 6 and 12 months if budget allows','Frontline','Year 1+','Medium','Auto-reminder from hire date'),
 ('Practical','Meals covered when on shift with youth; mileage paid for work driving','Everyone','At launch','Low','Expense claim'),
 ('Practical','Staff appreciation event twice a year','Everyone','Year 1+','Low','Calendar')
on conflict (perk) do nothing;

-- Add retention tasks to every launch plan's milestones
insert into launch_tasks (milestone_id, sort, task, is_heading, proposed_days)
select m.id, 100 + v.s, v.t, false, m.proposed_days
from launch_milestones m
join (values
  (1,1,'Board of Directors approves the career ladder and management promotion rule (24 months + reviews + Board decision)'),
  (5,1,'Publish Evergreen Total Rewards (perks + career ladder) in job posts and interviews'),
  (5,2,'Launch staff referral bonus (paid on hire and after 90 days)'),
  (6,1,'Offer letters state starting step, perks, and 90-day / 6-month review dates'),
  (8,1,'Assign a mentor/buddy to every new hire for the first 90 days'),
  (8,2,'Start monthly 1:1 supervision and "Evergreen Star" recognition'),
  (8,3,'Show the career ladder in the staff portal so staff see their next step'),
  (10,1,'Set up retention KPIs: turnover, vacancies, sick calls, 90-day retention'),
  (8,4,'Book 30 / 90 / 120-day probation reviews for every new hire in the CRM'),
  (12,1,'Confirm probation reviews are booked and perks are live before first intake')
) v(n,s,t) on v.n = m.number
where not exists (select 1 from launch_tasks x where x.milestone_id = m.id and x.task = v.t);


-- =====================================================================
-- PROBATION: 30 / 90 / 120-day reviews -> confirmation to full-time
--   30 & 90 days: Program Coordinator (level 2+) completes
--   120 days (final): Program Manager (level 3+) decides
--     Confirm full-time | Extend probation (+30 days) | End employment
-- =====================================================================

create table if not exists staff_probation (
  staff_id uuid primary key references profiles(id) on delete cascade,
  position text,
  hire_date date not null,
  status text not null default 'On probation'
    check (status in ('On probation','Extended','Confirmed full-time','Ended')),
  confirmed_on date,
  confirmed_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists probation_reviews (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_probation(staff_id) on delete cascade,
  review_day int not null,            -- 30, 90, 120 (150, 180 if extended)
  due_date date not null,
  completed_on date,
  reviewer_id uuid references profiles(id),
  rating text check (rating in ('Meets expectations','Needs improvement','Does not meet')),
  strengths text,
  areas_to_improve text,
  goals_next_period text,
  final_decision text check (final_decision in ('Confirm full-time','Extend probation','End employment')),
  staff_acknowledged boolean default false,
  unique (staff_id, review_day)
);

-- Adding someone to probation books all three reviews automatically
create or replace function book_probation_reviews() returns trigger language plpgsql as $$
begin
  insert into probation_reviews (staff_id, review_day, due_date)
  select new.staff_id, d, new.hire_date + d from unnest(array[30,90,120]) d
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists probation_book on staff_probation;
create trigger probation_book after insert on staff_probation
  for each row execute function book_probation_reviews();

-- Rules for completing reviews and the final decision
create or replace function check_probation_review() returns trigger language plpgsql as $$
declare final_day int;
begin
  if new.completed_on is not null and (tg_op = 'INSERT' or old.completed_on is null) then
    if new.rating is null then raise exception 'Choose a rating before completing the review.'; end if;
    select max(review_day) into final_day from probation_reviews where staff_id = new.staff_id;
    if new.review_day >= 120 and new.review_day = final_day then
      if app_level() < 3 then raise exception 'The final probation review is completed by a Program Manager or above.'; end if;
      if new.final_decision is null then raise exception 'Final review needs a decision: Confirm full-time, Extend probation, or End employment.'; end if;
      if new.final_decision = 'Confirm full-time' then
        update staff_probation set status = 'Confirmed full-time', confirmed_on = new.completed_on, confirmed_by = auth.uid()
          where staff_id = new.staff_id;
        -- HR file: employment type becomes Full-time
        insert into staff_details (profile_id, employment_type) values (new.staff_id, 'Full-time')
          on conflict (profile_id) do update set employment_type = 'Full-time', updated_at = now();
      elsif new.final_decision = 'Extend probation' then
        update staff_probation set status = 'Extended' where staff_id = new.staff_id;
        insert into probation_reviews (staff_id, review_day, due_date)
          values (new.staff_id, new.review_day + 30, new.completed_on + 30) on conflict do nothing;
      else
        update staff_probation set status = 'Ended' where staff_id = new.staff_id;
      end if;
    elsif new.final_decision is not null then
      raise exception 'Only the final (120-day) review has a decision.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists probation_review_rules on probation_reviews;
create trigger probation_review_rules before insert or update on probation_reviews
  for each row execute function check_probation_review();

-- The list for Program Coordinators and Program Managers
drop view if exists probation_due_list;
create view probation_due_list with (security_invoker = true) as
select pr.full_name as staff_name, p.position, pr.home_id, p.hire_date, p.status as probation_status,
       r.review_day || '-day review' as review, r.due_date, r.completed_on, r.rating, r.final_decision,
       case when r.completed_on is not null then 'Done'
            when r.due_date < current_date then 'Overdue'
            when r.due_date <= current_date + 7 then 'Due this week'
            else 'Upcoming' end as review_status,
       case when r.review_day >= 120 then 'Program Manager' else 'Program Coordinator' end as completed_by,
       r.id as review_id, p.staff_id
from staff_probation p join probation_reviews r on r.staff_id = p.staff_id
join profiles pr on pr.id = p.staff_id
where p.status in ('On probation','Extended') or r.completed_on is not null
order by (r.completed_on is not null), r.due_date;

alter table staff_probation enable row level security;
alter table probation_reviews enable row level security;
drop policy if exists prob_read on staff_probation;
drop policy if exists prob_write on staff_probation;
drop policy if exists prob_rev_read on probation_reviews;
drop policy if exists prob_rev_write on probation_reviews;

-- Who sees probation: the staff member (own), Program Coordinators (their house),
-- the HR group (everyone), Program Manager+ (everyone).
create or replace function can_see_probation(staff uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select staff = auth.uid()
      or app_level() >= 3
      or app_group() = 'hr'
      or (app_level() = 2 and app_group() is null and exists (
            select 1 from profiles s, profiles me
            where s.id = staff and me.id = auth.uid() and s.home_id = me.home_id));
$$;
create or replace function can_manage_probation(staff uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select staff <> auth.uid() and (
         app_level() >= 3
      or app_group() = 'hr'
      or (app_level() = 2 and app_group() is null and exists (
            select 1 from profiles s, profiles me
            where s.id = staff and me.id = auth.uid() and s.home_id = me.home_id)));
$$;
grant execute on function can_see_probation(uuid) to authenticated;
grant execute on function can_manage_probation(uuid) to authenticated;
create policy prob_read on staff_probation for select using (can_see_probation(staff_id));
create policy prob_write on staff_probation for all using (can_manage_probation(staff_id)) with check (can_manage_probation(staff_id));
create policy prob_rev_read on probation_reviews for select using (can_see_probation(staff_id));
create policy prob_rev_write on probation_reviews for all using (can_manage_probation(staff_id)) with check (can_manage_probation(staff_id));


-- =====================================================================
-- DOCUMENTS NEEDED BEFORE OPENING (best-practice pre-opening checklist)
-- Each launch plan gets the full checklist. Due dates count back from the
-- plan's opening_date (first day accepting youth). MCFD-required items come
-- from the SHSS Service Provider Guidebook; others are best practice / law.
-- =====================================================================
alter table launch_plans add column if not exists opening_date date;   -- service commencement

-- Sample name for the Stabilization draft (replace with the real name)
update launch_plans set care_setting_name = 'Cedar House - Stabilization (SAMPLE NAME)'
 where service_type = 'Low-Barrier Short-Term Stabilization Care' and care_setting_name is null;

create table if not exists launch_documents (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references launch_plans(id) on delete cascade,
  sort int not null,
  category text not null,
  document text not null,
  requirement text not null check (requirement in ('MCFD required','Legal requirement','Best practice')),
  days_before_opening int,          -- null = tied to contract date, not opening
  owner_role text,
  source_notes text,
  status text not null default 'Not started'
    check (status in ('Not started','Drafting','Ready for approval','Approved','Submitted to MCFD','Not applicable')),
  owner_id uuid references profiles(id),
  file_link text,                   -- SharePoint / OneDrive link to the document
  approved_by uuid references profiles(id),
  completed_on date,
  unique (plan_id, document)
);

insert into launch_documents (plan_id, sort, category, document, requirement, days_before_opening, owner_role, source_notes)
select p.id, v.sort, v.cat, v.doc, v.req, v.days, v.owner, v.src
from launch_plans p cross join (values
  (1,'MCFD contract','Final Transition-In Plan + budget (Net New template)','MCFD required',null,'Executive Director','Submit within 5 business days of the contract Effective Date (SHSS Guidebook)'),
  (2,'MCFD contract','SHSS Costing Tool for Net New Contracts','MCFD required',null,'Executive Director','Submitted with the budget (SHSS Guidebook)'),
  (3,'MCFD contract','Monthly Transition-In status update to Resource Team','Best practice',null,'Director of Operations','Monthly during Transition-In; tracks milestones'),
  (4,'MCFD contract','Environment of Care readiness (Appendix D checklist) - self-check complete','MCFD required',21,'Program Manager','Care setting must meet requirements before the MCFD site visit'),
  (5,'MCFD contract','Notice of expected Transition-In completion to MCFD','MCFD required',10,'Executive Director','At least 10 days'' notice (SHSS Guidebook)'),
  (6,'MCFD contract','Signed Transition-In Completion Certificate (Net New)','MCFD required',3,'CEO','Provided with completion notice (SHSS Guidebook)'),
  (7,'MCFD contract','Specialized Services Portal (SSP) access for PM and staff','MCFD required',14,'Program Manager','Needed to accept placements, service plans, monthly check-ins'),
  (8,'MCFD contract','SHSS Staffing Schedule (template) for first 4 weeks, 24/7 coverage','MCFD required',14,'Program Manager','SHSS (SP) Staffing Schedule Template'),
  (9,'Legal & insurance','Certificate of insurance (general liability incl. abuse coverage, property, auto)','Legal requirement',30,'Executive Director','As required by the SHSS contract'),
  (10,'Legal & insurance','Municipal business licence, zoning and occupancy confirmation','Legal requirement',45,'Director of Operations','Milestone 3'),
  (11,'Legal & insurance','WorkSafeBC registration and OHS program','Legal requirement',45,'Director of Operations','WorkSafeBC: employers must have an OHS program'),
  (12,'Legal & insurance','Workplace violence risk assessment + working-alone procedure','Legal requirement',30,'Director of Operations','WorkSafeBC OHS Regulation (violence, working alone)'),
  (13,'Health & safety','Fire safety and evacuation plan; first fire drill logged','Best practice',14,'Program Coordinator','Local fire code; drill before first youth arrives'),
  (14,'Health & safety','Emergency / disaster plan, on-call manager schedule','Best practice',14,'Program Manager',''),
  (15,'Health & safety','Food safety and nutrition plan, allergy procedure','Best practice',14,'Program Coordinator',''),
  (16,'Policies & procedures','Critical incident procedure: report immediately person-to-person + Reportable Incident Form within 24 hours','MCFD required',21,'Program Manager','SHSS (SP) Reportable Incident Reporting Form; already built into CRM incidents'),
  (17,'Policies & procedures','Complaints procedure (SHSS (SP) Complaints Reporting Form)','MCFD required',21,'Program Manager','SHSS Guidebook'),
  (18,'Policies & procedures','Root cause analysis procedure for serious incidents','MCFD required',21,'Director of Operations','SHSS Operational Policy appendix'),
  (19,'Policies & procedures','Medication administration policy, MAR, locked storage','Best practice',21,'Program Manager','Milestone 4 (medication storage)'),
  (20,'Policies & procedures','Behaviour support, de-escalation and physical intervention policy (CPI/Mandt)','Best practice',21,'Program Manager',''),
  (21,'Policies & procedures','Missing / runaway youth protocol (with RCMP / police contacts)','Best practice',21,'Program Manager',''),
  (22,'Policies & procedures','Privacy, consent and records policy (PIPA/FOIPPA, retention, CRM access levels)','Best practice',21,'Director of Operations',''),
  (23,'Policies & procedures','Rights of Children in Care posted; youth complaint process explained','Best practice',14,'Program Coordinator','MCFD Rights of Children and Youth in Care'),
  (24,'Policies & procedures','Cultural safety and Indigenous engagement plan (UNDRIP-aligned)','Best practice',30,'Director of Operations','Milestone 11'),
  (25,'Policies & procedures','Vehicle and transportation policy; driver''s abstracts on file','Best practice',21,'Program Manager',''),
  (26,'Care & intake','Intake procedure: accept placement in SSP, Summary of Approach to Resource Worker, intake meeting','MCFD required',14,'Program Manager','SHSS Guidebook placements section'),
  (27,'Care & intake','Care Circle within 2 days of placement; SHSS Service Plan workflow ready','MCFD required',14,'Program Manager','Service Plan due: Long-Term 30 days, Stabilization 14 days, Emergency 7 days, Respite 30 days'),
  (28,'Care & intake','Monthly child/youth check-in procedure (submitted in SSP)','MCFD required',14,'Program Coordinator','Monthly Check-In Guidelines for Service Providers'),
  (29,'Care & intake','Youth welcome package and house expectations (trauma-informed)','Best practice',14,'Program Coordinator',''),
  (30,'Care & intake','Daily log, shift note and handover templates live in CRM','Best practice',14,'Program Coordinator','Evergreen CRM daily documentation'),
  (31,'Care & intake','Transition-out / exit package template','Best practice',7,'Program Manager','Exit Plan due within 60 days of a Notice of Termination'),
  (32,'Staff','Screening complete for every staff: combined criminal record check (CF0622B), 3 references incl. last employer, interview','MCFD required',21,'HR','Screened in by MCFD before hire; CRC renewed every 3 years'),
  (33,'Staff','SRAT questionnaire plan: due within 30 days of each caregiver''s first unsupervised shift','MCFD required',7,'HR','Screening & Assessment of Caregivers - contracted agencies'),
  (34,'Staff','Training records: First Aid/CPR, CPI/Mandt, trauma-informed, cultural safety, medication','Best practice',14,'HR','Milestone 9; Evergreen Academy training matrix'),
  (35,'Staff','Staff handbook, code of conduct, job descriptions, career ladder, probation (30/90/120)','Best practice',21,'HR','Total rewards + probation in CRM'),
  (36,'Staff','Signed policy acknowledgements from every staff member','Best practice',7,'HR','CRM policy sign-off KPI'),
  (37,'Quality','Continuous Improvement Plan template started','Best practice',7,'Director of Operations','SHSS (SP) Continuous Improvement Plan Template'),
  (38,'Quality','Final internal readiness audit signed off by CEO','Best practice',5,'CEO','Milestone 12')
) v(sort, cat, doc, req, days, owner, src)
on conflict (plan_id, document) do nothing;

-- Due list: what must be ready, when, and whether it's late
create or replace view launch_documents_due with (security_invoker = true) as
select p.service_type, p.care_setting_name, p.opening_date,
       d.sort, d.category, d.document, d.requirement, d.owner_role, d.status, d.file_link, d.source_notes,
       case when d.days_before_opening is not null and p.opening_date is not null
            then p.opening_date - d.days_before_opening end as due_date,
       case when d.status in ('Approved','Submitted to MCFD','Not applicable') then 'Done'
            when p.opening_date is null then 'Set opening date'
            when d.days_before_opening is null then 'Contract-dated'
            when p.opening_date - d.days_before_opening < current_date then 'Overdue'
            when p.opening_date - d.days_before_opening <= current_date + 7 then 'Due this week'
            else 'Upcoming' end as due_status,
       d.id as document_id, p.id as plan_id
from launch_documents d join launch_plans p on p.id = d.plan_id;

-- Opening readiness: % of required documents done per plan
create or replace view launch_readiness with (security_invoker = true) as
select p.id as plan_id, p.service_type, p.care_setting_name, p.opening_date,
  count(*) filter (where d.requirement <> 'Best practice') as required_total,
  count(*) filter (where d.requirement <> 'Best practice' and d.status in ('Approved','Submitted to MCFD','Not applicable')) as required_done,
  count(*) as all_total,
  count(*) filter (where d.status in ('Approved','Submitted to MCFD','Not applicable')) as all_done,
  round(100.0 * count(*) filter (where d.status in ('Approved','Submitted to MCFD','Not applicable')) / nullif(count(*),0)) as pct_ready
from launch_plans p left join launch_documents d on d.plan_id = p.id
group by p.id;

-- Plan can't be marked Complete until every MCFD-required and legal document is done
create or replace function check_launch_complete() returns trigger language plpgsql as $$
declare missing int;
begin
  if new.status = 'Complete' and old.status is distinct from 'Complete' then
    select count(*) into missing from launch_documents
     where plan_id = new.id and requirement <> 'Best practice'
       and status not in ('Approved','Submitted to MCFD','Not applicable');
    if missing > 0 then
      raise exception 'Cannot open: % required documents are not approved yet (see launch_documents_due).', missing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists launch_complete_rule on launch_plans;
create trigger launch_complete_rule before update on launch_plans
  for each row execute function check_launch_complete();

alter table launch_documents enable row level security;
drop policy if exists launch_docs_read on launch_documents;
drop policy if exists launch_docs_write on launch_documents;
create policy launch_docs_read on launch_documents for select using (app_level() >= 3);
create policy launch_docs_write on launch_documents for all using (app_level() >= 3) with check (app_level() >= 3);


-- ---------- Audit log on every new table ----------
do $$ declare t text; begin
  foreach t in array array['launch_plans','launch_milestones','launch_tasks','launch_documents',
                           'career_ladder','staff_perks','staff_promotions','staff_probation','probation_reviews'] loop
    execute format('drop trigger if exists audit_%1$s on %1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on %1$I for each row execute function write_audit()', t);
  end loop; end $$;

-- Staff acknowledge their own probation review (they can't edit it).
create or replace function acknowledge_probation_review(review uuid) returns void
language sql security definer set search_path = public as $$
  update probation_reviews set staff_acknowledged = true
   where id = review and staff_id = auth.uid() and completed_on is not null;
$$;
grant execute on function acknowledge_probation_review(uuid) to authenticated;
