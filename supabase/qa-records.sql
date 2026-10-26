-- =====================================================================
-- Evergreen CRM - Quality assurance: records you enter and save. Safe to run again.
-- Run after qa-portal.sql, qa-phase2.sql, portal.sql, access-levels.sql and staff-groups.sql.
--
--  1. QA records (/qa/records): QA committee meetings, risk register, external inspections and
--     reviews, root cause analysis, yearly QA plan and goals, stakeholder feedback, and the
--     quarterly report sign-off. They are saved in the existing `records` table under the
--     division 'coa'. Only level 4+ (Director of Operations and up) can see, add or edit them.
--     HR / Payroll groups never see them (has_division already excludes groups).
--  2. COA standards checklist (/qa/standards): a starting checklist under each of the 10 COA
--     sections, written in Evergreen's own plain words, so every section has items to mark
--     Met / Not met, add notes and attach evidence. Add or rename items any time on the page.
--     Items already in the list are not changed.
-- =====================================================================

-- 1. Who can open the 'coa' records: level 4+ to see and add, level 4+ to edit everyone's.
insert into division_levels (division, view_level, edit_level) values ('coa', 4, 4)
on conflict (division) do update set view_level = 4, edit_level = 4;

-- 2. Starting checklist under each COA section.
insert into qa_standards (code, area, title) values
  -- Governance
  ('GOV-E1', 'GOV', 'The Board meets at least every quarter and keeps minutes'),
  ('GOV-E2', 'GOV', 'The Board reviews quality (QA) results at least once a year'),
  ('GOV-E3', 'GOV', 'Board members get an orientation and sign conflict-of-interest declarations every year'),
  ('GOV-E4', 'GOV', 'The Board reviews the Executive Director''s performance every year'),
  -- Financial Management
  ('FIN-E1', 'FIN', 'The yearly budget is approved by the Board before the year starts'),
  ('FIN-E2', 'FIN', 'Monthly financial statements are reviewed by the Executive Director'),
  ('FIN-E3', 'FIN', 'The books get an outside review or audit every year'),
  ('FIN-E4', 'FIN', 'Resident money is recorded with receipts and checked by a second person'),
  -- Performance and Quality Improvement
  ('PQI-E1', 'PQI', 'A written yearly QA plan sets goals, measures and targets'),
  ('PQI-E2', 'PQI', 'A QA committee meets at least every quarter and keeps minutes'),
  ('PQI-E3', 'PQI', 'Youth, families, social workers, funders and staff are surveyed and the results reviewed'),
  ('PQI-E4', 'PQI', 'A quarterly QA report is shared with staff and the Board'),
  ('PQI-E5', 'PQI', 'Every improvement action has an owner and a due date and is tracked to completion'),
  ('PQI-E6', 'PQI', 'Resident file reviews are done on a sample of files every 6 months'),
  -- Risk Prevention and Management
  ('RPM-E1', 'RPM', 'A risk register is kept and reviewed at least every year'),
  ('RPM-E2', 'RPM', 'Critical incidents are reported to MCFD / CLBC within 24 hours'),
  ('RPM-E3', 'RPM', 'A root cause analysis is done for every serious incident'),
  ('RPM-E4', 'RPM', 'Insurance coverage is reviewed every year'),
  ('RPM-E5', 'RPM', 'Privacy and records security are reviewed every year'),
  ('RPM-E6', 'RPM', 'The emergency and business-continuity plan is tested every year'),
  -- Human Resources
  ('HR-E1', 'HR', 'Criminal record checks are done before hire and renewed on time'),
  ('HR-E2', 'HR', 'Every role has a written job description'),
  ('HR-E3', 'HR', 'Every staff member gets a performance review every year'),
  ('HR-E4', 'HR', 'Personnel files are complete (references, credentials, signed policies)'),
  ('HR-E5', 'HR', 'Turnover, vacancies and sick calls are tracked and reviewed'),
  -- Training and Supervision
  ('TS-E1', 'TS', 'Orientation is finished before the first shift'),
  ('TS-E2', 'TS', 'Required training is current for every staff member'),
  ('TS-E3', 'TS', 'Direct-care staff get regular, recorded supervision'),
  ('TS-E4', 'TS', 'Supervisors are trained to supervise'),
  -- Administrative and Service Environment
  ('ASE-E1', 'ASE', 'Every house holds a fire drill every month'),
  ('ASE-E2', 'ASE', 'Every house has a monthly safety inspection and deficiencies are fixed'),
  ('ASE-E3', 'ASE', 'Fire, licensing and health inspections are current'),
  ('ASE-E4', 'ASE', 'Program vehicles are insured, maintained and checked'),
  ('ASE-E5', 'ASE', 'Medication is stored locked and only trained staff have access'),
  -- Behavior Support and Management
  ('BSM-E1', 'BSM', 'A written behaviour support policy bans prone holds, seclusion and harmful discipline'),
  ('BSM-E2', 'BSM', 'Only staff with current NVCI training use physical intervention'),
  ('BSM-E3', 'BSM', 'Every restraint is debriefed and reviewed by a manager'),
  ('BSM-E4', 'BSM', 'Restraint trends are reviewed every quarter'),
  -- Client Rights
  ('CR-E1', 'CR', 'Rights are explained to each person at admission and posted in every house'),
  ('CR-E2', 'CR', 'Complaints are acknowledged within 2 business days and resolved within 30 days'),
  ('CR-E3', 'CR', 'Consent to share information is on file before information is shared'),
  ('CR-E4', 'CR', 'Each youth knows how to reach their social worker, the RCY and the Ombudsperson'),
  -- Group Living Services
  ('GLS-E1', 'GLS', 'Each person has a care plan on time after admission, reviewed on schedule'),
  ('GLS-E2', 'GLS', 'Youth and families take part in planning'),
  ('GLS-E3', 'GLS', 'Daily logs are written for each person on every shift'),
  ('GLS-E4', 'GLS', 'Health, dental and vision appointments are kept up to date'),
  ('GLS-E5', 'GLS', 'Each person has a cultural plan'),
  ('GLS-E6', 'GLS', 'Each person has a transition / discharge plan')
on conflict (code) do nothing;

-- Check: should say coa_division = 1 and checklist_items = 48 (or more if you added your own)
select (select count(*) from division_levels where division = 'coa') as coa_division,
       (select count(*) from qa_standards where code <> area) as checklist_items;
