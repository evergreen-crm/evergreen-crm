-- Duties for every role (Roles plan A3, Nov 24 2026).
-- 1. New duty owner roles: hr, payroll, director_of_operations, cso, ceo, board (home_lead = Team Leader).
-- 2. duty_owner() also finds the person by position (staff_details.position via pay_rates.position_key, or a second
--    role in also_roles) for the roles that have a position_key, before falling back to access level as before.
-- 3. The duties from the role charters (ECC-ROLE-2026-003 … 013) for roles the register did not cover.
-- 4. Every duty whose source names an Evergreen document is linked to that policy (policy_id).

-- 1. Owner roles
do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid = 'public.duties'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%owner_role%';
  if c is not null then execute format('alter table public.duties drop constraint %I', c); end if;
end $$;
alter table public.duties add constraint duties_owner_role_check check (owner_role in ('executive_director', 'clinical_lead',
  'program_manager', 'program_coordinator', 'home_lead', 'support_worker', 'hr', 'payroll', 'director_of_operations', 'cso', 'ceo', 'board'));

alter table public.duty_role_levels add column if not exists position_key text;
insert into public.duty_role_levels (owner_role, level, position_key) values
  ('hr', 8, 'hr'), ('payroll', 8, 'payroll'), ('director_of_operations', 4, 'doo'), ('cso', 6, 'cso'), ('ceo', 7, 'ceo'), ('board', 8, 'board')
on conflict (owner_role) do update set level = excluded.level, position_key = excluded.position_key;
update public.duty_role_levels set position_key = 'team_leader' where owner_role = 'home_lead';
update public.duty_role_levels set position_key = 'clinical_lead' where owner_role = 'clinical_lead';
update public.duty_role_levels set position_key = 'ed' where owner_role = 'executive_director';

-- 2. Owner lookup: named holder for the home → named holder for everyone → person in that position (same home first)
--    → access level (as before). HR and Payroll fall back to the Administrator.
create or replace function public.duty_owner(p_role text, p_home uuid)
returns uuid language sql stable set search_path = public as $$
  select coalesce(
    (select profile_id from public.duty_role_holders where owner_role = p_role and home_id = p_home limit 1),
    (select profile_id from public.duty_role_holders where owner_role = p_role and home_id is null limit 1),
    (select sd.profile_id from public.staff_details sd
       join public.profiles p on p.id = sd.profile_id
       left join public.pay_rates pr on pr.position = sd.position
       join public.duty_role_levels k on k.owner_role = p_role and k.position_key is not null
      where p.active and (pr.position_key = k.position_key or k.position_key = any(sd.also_roles))
      order by (p_home is not null and (p.home_id = p_home or exists (select 1 from public.manager_homes mh where mh.profile_id = p.id and mh.home_id = p_home))) desc, p.created_at
      limit 1),
    (select p.id from public.profiles p where p.active and p.staff_group = case p_role when 'hr' then 'hr' when 'payroll' then 'payroll' end
      order by p.created_at limit 1),
    public.duty_holder_at_level(coalesce((select level from public.duty_role_levels where owner_role = p_role), 3), p_home))
$$;

-- 3. Duties from the role charters (all organization-wide unless noted; due dates follow the duty engine's rules).
insert into public.duties (duty_code, title, stream, domain, applies_to, owner_role, trigger_kind, schedule, schedule_param,
                           remind_days, safety_critical, proof, source_doc, source_ref, needs_review, active) values
 ('ROLE-TL-01', 'Team Leader weekly report to the Program Coordinator: supplies, repairs and staff concerns', 'BOTH', 10, 'home', 'home_lead', 'schedule', 'weekly', null, 1, false, 'Note in the communication log', 'ECC-ROLE-2026-003', 'Role charter §3', false, true),
 ('ROLE-HR-01', 'Follow up every policy not signed within 14 days', 'BOTH', 4, 'organization', 'hr', 'schedule', 'weekly', null, 1, false, 'Policy sign-off report', 'ECC-ROLE-2026-007', 'Role charter §3', false, true),
 ('ROLE-HR-02', 'Check onboarding progress for every new hire', 'BOTH', 4, 'organization', 'hr', 'schedule', 'weekly', null, 1, false, 'Onboarding checklists', 'ECC-ROLE-2026-007', 'Role charter §3', false, true),
 ('ROLE-HR-03', 'Certificates and training expiring in the next 60 days: tell the person and their Program Coordinator', 'BOTH', 4, 'organization', 'hr', 'schedule', 'monthly', '1', 5, false, 'Expiry report sent', 'ECC-ROLE-2026-007', 'Role charter §3', false, true),
 ('ROLE-HR-04', 'Start criminal record check renewals due in the next 90 days (5-year cycle)', 'BOTH', 4, 'organization', 'hr', 'schedule', 'monthly', '1', 5, true, 'CRC renewal requests', 'ECC-ROLE-2026-007', 'Role charter §3', false, true),
 ('ROLE-HR-05', 'Monthly HR compliance report sent to the Program Managers', 'BOTH', 4, 'organization', 'hr', 'schedule', 'monthly', '5', 3, false, 'Report sent', 'ECC-ROLE-2026-007', 'Role charter §3', false, true),
 ('ROLE-HR-06', 'Personnel file sample audit with the Executive Director', 'BOTH', 4, 'organization', 'hr', 'schedule', 'quarterly', null, 7, false, 'Audit record', 'ECC-ROLE-2026-007', 'Role charter §3', false, true),
 ('ROLE-HR-07', 'Pay rates and the wage grid checked with Payroll', 'BOTH', 4, 'organization', 'hr', 'schedule', 'quarterly', null, 7, false, 'Pay rates page reviewed', 'ECC-ROLE-2026-007', 'Role charter §3', false, true),
 ('ROLE-HR-08', 'Annual policy re-sign campaign started for all staff', 'BOTH', 4, 'organization', 'hr', 'schedule', 'annual', 'policy_review', 14, false, 'Policy sign-off report', 'ECC-ROLE-2026-007', 'Role charter §3', false, true),
 ('ROLE-HR-09', 'Role charters and job descriptions reviewed with managers', 'BOTH', 4, 'organization', 'hr', 'schedule', 'annual', '10-15', 14, false, 'Charters updated in the Policy Library', 'ECC-ROLE-2026-007', 'Role charter §3', false, true),
 ('ROLE-HR-10', 'Annual staff survey sent and results shared with leadership', 'BOTH', 4, 'organization', 'hr', 'schedule', 'annual', '09-30', 14, false, 'Survey results', 'ECC-ROLE-2026-007', 'Role charter §3', false, true),
 ('ROLE-PAY-01', 'Source deductions remitted to CRA', 'BOTH', 5, 'organization', 'payroll', 'schedule', 'monthly', '15', 3, true, 'Remittance confirmation', 'ECC-ROLE-2026-008', 'Role charter §3', false, true),
 ('ROLE-PAY-02', 'Payroll reconciled to the general ledger with the Executive Director', 'BOTH', 5, 'organization', 'payroll', 'schedule', 'monthly', 'last', 3, false, 'Reconciliation', 'ECC-ROLE-2026-008', 'Role charter §3', false, true),
 ('ROLE-PAY-03', 'WorkSafeBC premiums reported', 'BOTH', 5, 'organization', 'payroll', 'schedule', 'quarterly', null, 7, true, 'WorkSafeBC report', 'ECC-ROLE-2026-008', 'Role charter §3', false, true),
 ('ROLE-PAY-04', 'Pay rates and grid steps checked with HR', 'BOTH', 5, 'organization', 'payroll', 'schedule', 'quarterly', null, 7, false, 'Pay rates page reviewed', 'ECC-ROLE-2026-008', 'Role charter §3', false, true),
 ('ROLE-PAY-05', 'T4 slips and T4 Summary filed', 'BOTH', 5, 'organization', 'payroll', 'schedule', 'annual', '02-28', 30, true, 'CRA filing confirmation', 'ECC-ROLE-2026-008', 'Role charter §3', false, true),
 ('ROLE-PAY-06', 'New wage grid entered when it changes', 'BOTH', 5, 'organization', 'payroll', 'schedule', 'annual', '04-01', 30, false, 'Pay rates page updated', 'ECC-ROLE-2026-008', 'Role charter §3', false, true),
 ('ROLE-DOO-01', 'Meet with the Program Managers; review the all-homes board and overdue duties', 'BOTH', 10, 'organization', 'director_of_operations', 'schedule', 'weekly', null, 1, false, 'Meeting notes', 'ECC-ROLE-2026-009', 'Role charter §3', false, true),
 ('ROLE-DOO-02', 'Monthly operations report to the Executive Director: occupancy, staffing, incidents, complaints, compliance', 'BOTH', 10, 'organization', 'director_of_operations', 'schedule', 'monthly', '5', 3, false, 'Report', 'ECC-ROLE-2026-009', 'Role charter §3', false, true),
 ('ROLE-DOO-03', 'Admissions and vacancies reviewed with the Program Managers', 'BOTH', 3, 'organization', 'director_of_operations', 'schedule', 'monthly', '10', 3, false, 'Meeting notes', 'ECC-ROLE-2026-009', 'Role charter §3', false, true),
 ('ROLE-DOO-04', 'Incident and complaint trends across all homes reviewed with the Executive Director and Clinical Lead', 'BOTH', 6, 'organization', 'director_of_operations', 'schedule', 'quarterly', null, 7, false, 'Trend report', 'ECC-ROLE-2026-009', 'Role charter §3', false, true),
 ('ROLE-DOO-05', 'Staffing and schedules reviewed across all homes', 'BOTH', 4, 'organization', 'director_of_operations', 'schedule', 'quarterly', null, 7, false, 'Staffing review', 'ECC-ROLE-2026-009', 'Role charter §3', false, true),
 ('ROLE-DOO-06', 'Licensing renewals and fire inspections confirmed for every home', 'BOTH', 7, 'organization', 'director_of_operations', 'schedule', 'annual', '06-30', 30, true, 'Certificates on file', 'ECC-ROLE-2026-009', 'Role charter §3', false, true),
 ('ROLE-DOO-07', 'Program Manager performance reviews completed', 'BOTH', 4, 'organization', 'director_of_operations', 'schedule', 'annual', '12-15', 30, false, 'Signed reviews', 'ECC-ROLE-2026-009', 'Role charter §3', false, true),
 ('ROLE-CSO-01', 'Strategic plan progress report to the CEO', 'BOTH', 1, 'organization', 'cso', 'schedule', 'monthly', 'last', 3, false, 'Report', 'ECC-ROLE-2026-011', 'Role charter §3', false, true),
 ('ROLE-CSO-02', 'Funder opportunities and RFQ deadlines reviewed', 'BOTH', 1, 'organization', 'cso', 'schedule', 'monthly', '1', 3, false, 'Opportunity list', 'ECC-ROLE-2026-011', 'Role charter §3', false, true),
 ('ROLE-CSO-03', 'Growth and budget forecast updated with the Executive Director', 'BOTH', 5, 'organization', 'cso', 'schedule', 'quarterly', null, 7, false, 'Forecast', 'ECC-ROLE-2026-011', 'Role charter §3', false, true),
 ('ROLE-CSO-04', 'Strategy report to the Board of Directors', 'BOTH', 1, 'organization', 'cso', 'schedule', 'quarterly', null, 7, false, 'Board report', 'ECC-ROLE-2026-011', 'Role charter §3', false, true),
 ('ROLE-CSO-05', 'Strategic plan refreshed with the Board of Directors', 'BOTH', 1, 'organization', 'cso', 'schedule', 'annual', '09-30', 30, false, 'Updated strategic plan', 'ECC-ROLE-2026-011', 'Role charter §3', false, true),
 ('ROLE-CSO-06', 'Pay, benefits and profit-sharing review with the CEO', 'BOTH', 4, 'organization', 'cso', 'schedule', 'annual', '03-31', 30, false, 'Review notes', 'ECC-ROLE-2026-011', 'Role charter §3', false, true),
 ('ROLE-CSO-07', 'Annual partnership review', 'BOTH', 1, 'organization', 'cso', 'schedule', 'annual', '05-31', 30, false, 'Partnership review', 'ECC-ROLE-2026-011', 'Role charter §3', false, true),
 ('ROLE-CEO-01', 'Leadership meeting with the Executive Director and Chief Strategic Officer', 'BOTH', 1, 'organization', 'ceo', 'schedule', 'monthly', '7', 3, false, 'Meeting notes', 'ECC-ROLE-2026-012', 'Role charter §3', false, true),
 ('ROLE-CEO-02', 'Security audit log and access changes reviewed', 'BOTH', 8, 'organization', 'ceo', 'schedule', 'monthly', '7', 3, false, 'Audit log reviewed', 'ECC-ROLE-2026-012', 'Role charter §3', false, true),
 ('ROLE-CEO-03', 'Report to the Board: performance, finance, risk, incidents and complaints', 'BOTH', 1, 'organization', 'ceo', 'schedule', 'quarterly', null, 14, false, 'Board report', 'ECC-ROLE-2026-012', 'Role charter §3', false, true),
 ('ROLE-CEO-04', 'Risk register reviewed', 'BOTH', 9, 'organization', 'ceo', 'schedule', 'quarterly', null, 7, false, 'Risk register', 'ECC-ROLE-2026-012', 'Role charter §3', false, true),
 ('ROLE-CEO-05', 'Executive Director and Chief Strategic Officer performance reviews', 'BOTH', 4, 'organization', 'ceo', 'schedule', 'annual', '12-15', 30, false, 'Signed reviews', 'ECC-ROLE-2026-012', 'Role charter §3', false, true),
 ('ROLE-CEO-06', 'Budget and strategic plan presented to the Board of Directors', 'BOTH', 5, 'organization', 'ceo', 'schedule', 'annual', '03-15', 30, false, 'Board approval', 'ECC-ROLE-2026-012', 'Role charter §3', false, true),
 ('ROLE-BRD-01', 'Board meeting held with quorum; minutes recorded', 'BOTH', 1, 'organization', 'board', 'schedule', 'quarterly', null, 14, false, 'Approved minutes', 'ECC-ROLE-2026-013', 'Board charter §3', false, true),
 ('ROLE-BRD-02', 'Annual policy review approved by the Board', 'BOTH', 1, 'organization', 'board', 'schedule', 'annual', 'policy_review', 30, false, 'Board motion', 'ECC-ROLE-2026-013', 'Board charter §3', false, true),
 ('ROLE-BRD-03', 'Budget and strategic plan approved', 'BOTH', 1, 'organization', 'board', 'schedule', 'annual', '03-31', 30, false, 'Board motion', 'ECC-ROLE-2026-013', 'Board charter §3', false, true),
 ('ROLE-BRD-04', 'CEO performance review', 'BOTH', 1, 'organization', 'board', 'schedule', 'annual', '12-31', 30, false, 'Signed review', 'ECC-ROLE-2026-013', 'Board charter §3', false, true),
 ('ROLE-BRD-05', 'Conflict-of-interest declarations renewed by every board member; board self-evaluation', 'BOTH', 1, 'organization', 'board', 'schedule', 'annual', '01-31', 30, false, 'Signed declarations', 'ECC-ROLE-2026-013', 'Board charter §3', false, true)
on conflict (duty_code) do update set title = excluded.title, domain = excluded.domain, applies_to = excluded.applies_to,
  owner_role = excluded.owner_role, schedule = excluded.schedule, schedule_param = excluded.schedule_param,
  remind_days = excluded.remind_days, safety_critical = excluded.safety_critical, proof = excluded.proof,
  source_doc = excluded.source_doc, source_ref = excluded.source_ref, updated_at = now();

-- 4. Link duties to the policy their source names (first Evergreen document code in source_doc; role charters link
--    once they are uploaded to the CRM). Re-running links any that were not uploaded yet.
create or replace function public.duty_link_policies() returns int language sql security definer set search_path = public as $$
  with m as (
    select d.id, p.id pid from duties d
      join policies p on p.code = substring(d.source_doc from '(ECC-[A-Z0-9]+(?:-[A-Z0-9]+)*-2026-\d{3}(?:-[A-Z]+)*)')
     where d.policy_id is distinct from p.id
    union all
    -- Funder sources (CLBC RFQ-590 forms, MCFD policy chapters, CFCSA) linked to the Evergreen policy that meets them.
    select d.id, p.id from duties d
      join policies p on p.code = case
        when d.source_doc ilike '%H-7 Medication%' then 'ECC-MED-2026-001'
        when d.source_doc ilike '%Complaints%' then 'ECC-RC-COMP-2026-001'
        when d.source_doc ilike '%Accessibility%' then 'ECC-ACCESS-POL-2026-001'
        when d.source_doc ilike '%Rights%' then 'ECC-RIGHTS-POL-2026-001'
        when d.source_doc ilike '%Staffing%' then 'ECC-HR-POL-2026-001'
        when d.source_doc ilike '%Health & Safety%' then 'ECC-OHS-POL-2026-002'
        when d.source_doc ilike '%Finance%' then 'ECC-FIN-POL-2026-001'
        when d.source_doc ilike 'RFQ-590%' then 'ECC-QA-OM-2026-001'
        when d.source_doc ilike '%MCFD Policy%' or d.source_doc ilike 'CFCSA%' then 'ECC-RC-POL-2026-003'
        when d.source_doc = 'All policies' then 'ECC-POL-REG-2026-001' end
     where d.source_doc !~ 'ECC-[A-Z]' and d.policy_id is null
  ), u as (update duties d set policy_id = m.pid, updated_at = now() from m where d.id = m.id returning 1)
  select count(*)::int from u
$$;
revoke execute on function public.duty_link_policies() from public, anon, authenticated;
select public.duty_link_policies();
