-- =====================================================================
-- Evergreen CRM - Pre-opening house checklist (MCFD SHSS) for every launch plan.
-- Based on the Appendix E Transition-In Plan and the project doc
-- "Pre-Opening Residential House Checklist (MCFD SHSS)". Run after launch-people.sql
-- and launch-files.sql. Safe to run again.
--  * One copy of the 87-item checklist per launch plan (new plans get it automatically).
--  * Due date = contract effective date + the item's day (Day 0-90).
--  * Executive items can only be ticked by the right level (ED 5, CEO 7).
--  * The CEO go/no-go stays LOCKED until every MCFD and legal item is done (or N/A with a reason),
--    and a plan can't be marked Complete until the CEO go/no-go is signed.
-- =====================================================================

create table if not exists launch_checklist_template (
  code        text primary key,
  sort        int not null,
  part        text not null,
  item        text not null,
  tag         text not null check (tag in ('MCFD','LAW','BP')),
  owner_role  text,
  day         int,              -- day of the 90-day transition-in period
  due_note    text,
  min_level   int not null default 3,   -- who may tick it: 3 PM, 5 Executive Director, 7 CEO
  after_gate  boolean not null default false  -- only after the CEO go/no-go
);

insert into launch_checklist_template (code, sort, part, item, tag, owner_role, day, due_note, min_level, after_gate) values
  ('A01', 1, 'A · Contract, governance and money', 'Contract signed; contract number and effective date recorded in the CRM', 'MCFD', 'Executive Director', 0, null, 5, false),
  ('exec_plan', 2, 'A · Contract, governance and money', 'Executive approval of plan and budget (Executive Director + CSO)', 'BP', 'Executive Director / CSO', 3, 'Before submitting', 5, false),
  ('A03', 3, 'A · Contract, governance and money', 'Transition-In Lead named (Program Manager or above)', 'MCFD', 'CEO', 3, null, 3, false),
  ('A04', 4, 'A · Contract, governance and money', 'Governance team set: HR, Operations, Clinical/Practice lead, Finance', 'MCFD', 'Director of Operations', 7, null, 3, false),
  ('A05', 5, 'A · Contract, governance and money', 'Final Transition-In Plan + budget submitted (Net New template)', 'MCFD', 'Executive Director', 7, 'Within 5 business days of the effective date', 3, false),
  ('A06', 6, 'A · Contract, governance and money', 'SHSS Costing Tool submitted with the budget', 'MCFD', 'Executive Director', 7, 'With the budget', 3, false),
  ('A07', 7, 'A · Contract, governance and money', 'Payment option (1 or 2) confirmed; payment maximums entered in dollars', 'MCFD', 'Executive Director', 7, 'With the budget', 3, false),
  ('A08', 8, 'A · Contract, governance and money', 'First meeting with MCFD Resource Team: expectations, contacts, reporting', 'MCFD', 'Transition-In Lead', 14, null, 3, false),
  ('A09', 9, 'A · Contract, governance and money', 'Monthly transition-in status update to MCFD booked', 'BP', 'Director of Operations', 30, 'Monthly', 3, false),
  ('B01', 10, 'B · Finding and securing the house', 'At least 2-3 property options identified (backup if one falls through)', 'MCFD', 'Director of Operations', 21, null, 3, false),
  ('B02', 11, 'B · Finding and securing the house', 'Each property pre-checked against the Appendix D Environment of Care checklist', 'MCFD', 'Program Manager', 30, null, 3, false),
  ('B03', 12, 'B · Finding and securing the house', 'Location reviewed: close to schools, health services, transit, community supports', 'MCFD', 'Program Manager', 30, null, 3, false),
  ('B04', 13, 'B · Finding and securing the house', 'Neighbourhood safety and suitability review', 'MCFD', 'Program Manager', 30, null, 3, false),
  ('B05', 14, 'B · Finding and securing the house', 'Zoning and municipal business licence confirmed for a staffed residential home', 'LAW', 'Director of Operations', 40, 'Before the lease', 3, false),
  ('B06', 15, 'B · Finding and securing the house', 'Occupancy and building bylaws confirmed (bedrooms, egress windows, fire separation)', 'LAW', 'Director of Operations', 40, 'Before the lease', 3, false),
  ('exec_lease', 16, 'B · Finding and securing the house', 'Executive approval to sign the lease (Executive Director + CEO)', 'BP', 'Executive Director / CEO', 42, 'Before signing', 5, false),
  ('B08', 17, 'B · Finding and securing the house', 'Lease or purchase agreement signed; landlord informed of use', 'MCFD', 'Executive Director', 45, null, 3, false),
  ('B09', 18, 'B · Finding and securing the house', 'Insurance certificate: general liability (incl. abuse coverage), property/contents, auto', 'LAW', 'Executive Director', 45, null, 3, false),
  ('C01', 19, 'C · Staffing and clearances', 'Recruitment launched (job boards, regional outreach, internal pool)', 'MCFD', 'HR', 0, 'Start on Day 0 - clearances take 30-45 days', 3, false),
  ('C02', 20, 'C · Staffing and clearances', 'Staffing model for 24/7 coverage, with experienced staff for mentoring', 'MCFD', 'Program Manager', 30, null, 3, false),
  ('C03', 21, 'C · Staffing and clearances', 'Pre-screening done with the Evergreen Combined Pre-Screening Standard', 'BP', 'HR', 30, null, 3, false),
  ('C04', 22, 'C · Staffing and clearances', 'Conditional offers made (subject to clearance)', 'MCFD', 'HR', 45, null, 3, false),
  ('C05', 23, 'C · Staffing and clearances', 'Screening complete for every staff: combined criminal record check (CF0622B), 3 references incl. last employer, interview', 'MCFD', 'HR', 60, null, 3, false),
  ('C06', 24, 'C · Staffing and clearances', 'Documents submitted to the MCFD Hub; staff screened in before hire', 'MCFD', 'HR', 75, null, 3, false),
  ('C07', 25, 'C · Staffing and clearances', 'Education, certificates and driver licence/abstract checked', 'MCFD', 'HR', 60, null, 3, false),
  ('C08', 26, 'C · Staffing and clearances', 'SRAT plan: questionnaire due within 30 days of each caregiver first unsupervised shift', 'MCFD', 'HR', 83, null, 3, false),
  ('C09', 27, 'C · Staffing and clearances', 'Employment agreements, job descriptions, Staff Handbook and policies signed', 'BP', 'HR', 80, null, 3, false),
  ('C10', 28, 'C · Staffing and clearances', 'Staff ID numbers and ID cards issued in the CRM', 'BP', 'HR', 80, null, 3, false),
  ('C11', 29, 'C · Staffing and clearances', 'SHSS staffing schedule for the first 4 weeks (24/7)', 'MCFD', 'Program Manager', 76, null, 3, false),
  ('C12', 30, 'C · Staffing and clearances', 'Consistent shift assignments so youth see the same faces', 'MCFD', 'Program Coordinator', 76, null, 3, false),
  ('D01', 31, 'D · The house: setup and safety', 'Bedrooms furnished: own bed, storage, lockable space for belongings, privacy', 'MCFD', 'Program Coordinator', 70, null, 3, false),
  ('D02', 32, 'D · The house: setup and safety', 'Common areas, kitchen, dining and staff workspace furnished', 'MCFD', 'Program Coordinator', 70, null, 3, false),
  ('D03', 33, 'D · The house: setup and safety', 'Trauma-informed, youth-friendly setup (calm, personal, not institutional)', 'MCFD', 'Program Manager', 70, null, 3, false),
  ('D04', 34, 'D · The house: setup and safety', 'Smoke and CO alarms on every level and outside bedrooms, tested', 'LAW', 'Program Coordinator', 60, null, 3, false),
  ('D05', 35, 'D · The house: setup and safety', 'Fire extinguishers (kitchen + each level), inspected and tagged', 'LAW', 'Program Coordinator', 60, null, 3, false),
  ('D06', 36, 'D · The house: setup and safety', 'Clear emergency exits; bedroom windows open for escape; exit routes posted', 'LAW', 'Program Coordinator', 60, null, 3, false),
  ('D07', 37, 'D · The house: setup and safety', 'Locked medication storage (locked cabinet for controlled drugs), access limited to trained staff', 'MCFD', 'Program Manager', 60, null, 3, false),
  ('D08', 38, 'D · The house: setup and safety', 'Sharps, cleaning chemicals, tools and knives secured; WHMIS labels in place', 'LAW', 'Program Coordinator', 60, null, 3, false),
  ('D09', 39, 'D · The house: setup and safety', 'First aid kit and naloxone kit stocked; locations posted', 'BP', 'Program Coordinator', 70, null, 3, false),
  ('D10', 40, 'D · The house: setup and safety', 'Ligature, self-harm and safety walk-through done; risks fixed or noted', 'BP', 'Program Manager', 70, null, 3, false),
  ('D11', 41, 'D · The house: setup and safety', 'Doors, locks, lighting and entry security checked; visitor sign-in at the entrance', 'BP', 'Program Coordinator', 70, null, 3, false),
  ('D12', 42, 'D · The house: setup and safety', 'Hot water temperature safe; heating, plumbing and appliances working', 'BP', 'Program Coordinator', 70, null, 3, false),
  ('D13', 43, 'D · The house: setup and safety', 'House phone, internet and a work cell phone for staff', 'BP', 'Director of Operations', 70, null, 3, false),
  ('D14', 44, 'D · The house: setup and safety', 'House location (GPS) set in the CRM for shift check-ins', 'BP', 'Program Manager', 75, null, 3, false),
  ('D15', 45, 'D · The house: setup and safety', 'Internal inspection against Appendix D; Environment of Care self-check complete', 'MCFD', 'Program Manager', 69, '21 days before opening', 3, false),
  ('D16', 46, 'D · The house: setup and safety', 'MCFD site visit passed', 'MCFD', 'Transition-In Lead', 85, 'Before opening', 3, false),
  ('E01', 47, 'E · Policies and procedures', 'Critical incident procedure: report immediately person-to-person + Reportable Incident Form within 24 hours', 'MCFD', 'Program Manager', 69, null, 3, false),
  ('E02', 48, 'E · Policies and procedures', 'Complaints procedure (SHSS Complaints Reporting Form)', 'MCFD', 'Program Manager', 69, null, 3, false),
  ('E03', 49, 'E · Policies and procedures', 'Root cause analysis procedure for serious incidents', 'MCFD', 'Director of Operations', 69, null, 3, false),
  ('E04', 50, 'E · Policies and procedures', 'Missing/runaway youth protocol, with local RCMP/police contacts', 'BP', 'Program Manager', 69, null, 3, false),
  ('E05', 51, 'E · Policies and procedures', 'Medication policy, MAR and medication error procedure', 'BP', 'Program Manager', 69, null, 3, false),
  ('E06', 52, 'E · Policies and procedures', 'Behaviour support, de-escalation and physical intervention policy (CPI/Mandt)', 'BP', 'Program Manager', 69, null, 3, false),
  ('E07', 53, 'E · Policies and procedures', 'Privacy, consent and records policy; CRM access levels set', 'BP', 'Director of Operations', 69, null, 3, false),
  ('E08', 54, 'E · Policies and procedures', 'WorkSafeBC registration and OHS program', 'LAW', 'Director of Operations', 45, null, 3, false),
  ('E09', 55, 'E · Policies and procedures', 'Workplace violence risk assessment and working-alone procedure', 'LAW', 'Director of Operations', 60, null, 3, false),
  ('E10', 56, 'E · Policies and procedures', 'Fire safety and evacuation plan; first fire drill logged', 'BP', 'Program Coordinator', 76, null, 3, false),
  ('E11', 57, 'E · Policies and procedures', 'Emergency/disaster plan and on-call manager schedule', 'BP', 'Program Manager', 76, null, 3, false),
  ('E12', 58, 'E · Policies and procedures', 'Food safety, nutrition and allergy procedure', 'BP', 'Program Coordinator', 76, null, 3, false),
  ('E13', 59, 'E · Policies and procedures', 'Vehicle policy; driver abstracts on file', 'BP', 'Program Manager', 69, null, 3, false),
  ('E14', 60, 'E · Policies and procedures', 'Rights of Children and Youth in Care poster up; complaint process ready to explain', 'BP', 'Program Coordinator', 76, null, 3, false),
  ('F01', 61, 'F · Systems', 'Specialized Services Portal (SSP) access for the Program Manager and staff', 'MCFD', 'Program Manager', 76, null, 3, false),
  ('F02', 62, 'F · Systems', 'Evergreen CRM ready: house, staff accounts, daily notes, incidents, MAR, schedule', 'BP', 'Administrator', 60, null, 3, false),
  ('F03', 63, 'F · Systems', 'Microsoft 365/Teams set up for secure communication', 'BP', 'Administrator', 60, null, 3, false),
  ('F04', 64, 'F · Systems', 'Communication protocol with MCFD agreed (who calls whom, and when)', 'MCFD', 'Transition-In Lead', 60, null, 3, false),
  ('G01', 65, 'G · Training and certification', 'Before first shift: Orientation, Youth Rights, Mandatory Reporting, WHMIS (Evergreen Academy)', 'MCFD', 'HR', 76, 'Before each first shift', 3, false),
  ('G02', 66, 'G · Training and certification', 'First Aid/CPR and CPI/Mandt (NVCI) certified', 'MCFD', 'HR', 85, null, 3, false),
  ('G03', 67, 'G · Training and certification', 'Trauma-informed practice and cultural safety/UNDRIP-aligned training', 'MCFD', 'HR', 85, null, 3, false),
  ('G04', 68, 'G · Training and certification', 'Medication theory and hands-on sign-off for staff who give medication', 'BP', 'Program Manager', 85, null, 3, false),
  ('G05', 69, 'G · Training and certification', 'Supervisor training: oversight, documentation, incident response', 'MCFD', 'Director of Operations', 85, null, 3, false),
  ('G06', 70, 'G · Training and certification', 'Every staff member on track in their 90-day training plan', 'BP', 'HR', 85, null, 3, false),
  ('H01', 71, 'H · Community and Indigenous engagement', 'Early contact with local Indigenous communities and organizations; engagement plan written', 'MCFD', 'Director of Operations', 45, null, 3, false),
  ('H02', 72, 'H · Community and Indigenous engagement', 'Introductions: MCFD resource workers, CYMH clinicians, schools, RCMP/fire/ambulance', 'MCFD', 'Program Manager', 60, null, 3, false),
  ('H03', 73, 'H · Community and Indigenous engagement', 'Neighbour information (respectful, no youth details)', 'BP', 'Program Manager', 60, null, 3, false),
  ('H04', 74, 'H · Community and Indigenous engagement', 'Care Circle approach ready (within 2 days of each placement)', 'MCFD', 'Program Manager', 76, null, 3, false),
  ('H05', 75, 'H · Community and Indigenous engagement', 'Culturally appropriate practices and supports in place', 'MCFD', 'Program Manager', 76, null, 3, false),
  ('I01', 76, 'I · Intake ready', 'Intake procedure: accept placement in SSP, Summary of Approach to Resource Worker, intake meeting', 'MCFD', 'Program Manager', 76, null, 3, false),
  ('I02', 77, 'I · Intake ready', 'SHSS Service Plan workflow ready (Long-Term 30 days, Stabilization 14, Emergency 7, Respite 30)', 'MCFD', 'Program Manager', 76, null, 3, false),
  ('I03', 78, 'I · Intake ready', 'Monthly youth check-in procedure (submitted in SSP)', 'MCFD', 'Program Coordinator', 76, null, 3, false),
  ('I04', 79, 'I · Intake ready', 'Youth welcome package and house expectations (trauma-informed)', 'BP', 'Program Coordinator', 83, null, 3, false),
  ('I05', 80, 'I · Intake ready', 'Transition-out/exit package template', 'BP', 'Program Manager', 83, null, 3, false),
  ('J01', 81, 'J · Final readiness and opening', 'Final internal audit across every part of this checklist', 'MCFD', 'Director of Operations', 78, null, 3, false),
  ('J02', 82, 'J · Final readiness and opening', 'Risk assessment and risk mitigation review', 'MCFD', 'Director of Operations', 78, null, 3, false),
  ('J03', 83, 'J · Final readiness and opening', 'Notice of expected transition-in completion to MCFD (at least 10 days ahead)', 'MCFD', 'Executive Director', 80, 'At least 10 days before opening', 5, false),
  ('go_no_go', 84, 'J · Final readiness and opening', 'CEO go/no-go sign-off: staffing ready, property compliant, systems working', 'BP', 'CEO', 85, 'Locked until every MCFD and legal item is done', 7, false),
  ('J05', 85, 'J · Final readiness and opening', 'Signed Transition-In Completion Certificate (Net New)', 'MCFD', 'CEO', 87, 'With the completion notice', 7, true),
  ('J06', 86, 'J · Final readiness and opening', 'Continuous Improvement Plan started (SHSS template)', 'BP', 'Director of Operations', 87, null, 3, true),
  ('J07', 87, 'J · Final readiness and opening', 'First placement accepted', 'MCFD', 'Program Manager', 90, null, 3, true)
on conflict (code) do update set sort = excluded.sort, part = excluded.part, item = excluded.item, tag = excluded.tag,
  owner_role = excluded.owner_role, day = excluded.day, due_note = excluded.due_note, min_level = excluded.min_level, after_gate = excluded.after_gate;

create table if not exists launch_checklist (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references launch_plans(id) on delete cascade,
  code            text not null references launch_checklist_template(code) on delete cascade,
  done_on         date,
  done_by         uuid references profiles(id),
  not_applicable  boolean not null default false,
  note            text,
  file_path       text,
  file_name       text,
  updated_at      timestamptz default now(),
  unique (plan_id, code)
);

alter table launch_checklist_template enable row level security;
alter table launch_checklist enable row level security;
drop policy if exists checklist_tpl_read on launch_checklist_template;
drop policy if exists checklist_tpl_write on launch_checklist_template;
drop policy if exists checklist_read on launch_checklist;
drop policy if exists checklist_update on launch_checklist;
drop policy if exists checklist_add on launch_checklist;
drop policy if exists checklist_remove on launch_checklist;
create policy checklist_tpl_read on launch_checklist_template for select using (app_level() >= 3);
create policy checklist_tpl_write on launch_checklist_template for all using (app_level() >= 7) with check (app_level() >= 7);
create policy checklist_read on launch_checklist for select using (app_level() >= 3);
create policy checklist_update on launch_checklist for update using (app_level() >= 3) with check (app_level() >= 3);
create policy checklist_add on launch_checklist for insert with check (app_level() >= 4);
create policy checklist_remove on launch_checklist for delete using (app_level() >= 7);

-- Every plan gets the checklist (existing plans now, new plans automatically).
insert into launch_checklist (plan_id, code)
select p.id, t.code from launch_plans p cross join launch_checklist_template t
on conflict (plan_id, code) do nothing;

create or replace function launch_checklist_seed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into launch_checklist (plan_id, code) select new.id, t.code from launch_checklist_template t
  on conflict (plan_id, code) do nothing;
  return new;
end $$;
drop trigger if exists launch_plans_checklist on launch_plans;
create trigger launch_plans_checklist after insert on launch_plans for each row execute function launch_checklist_seed();

-- Rules when an item is ticked.
create or replace function launch_checklist_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare t launch_checklist_template; open_count int; gate_done boolean;
begin
  select * into t from launch_checklist_template where code = new.code;
  new.updated_at := now();
  if (new.done_on is not null or new.not_applicable) and not (old.done_on is not null or old.not_applicable) then
    if app_level() < t.min_level then
      raise exception 'Only % (level % or above) can sign off: %', coalesce(t.owner_role, 'a senior leader'), t.min_level, t.item;
    end if;
    if new.not_applicable and t.tag in ('MCFD','LAW') and coalesce(trim(new.note), '') = '' then
      raise exception 'Give a reason when an MCFD or legal item is marked Not applicable.';
    end if;
    new.done_by := auth.uid();
    if new.code = 'go_no_go' then
      select count(*) into open_count from launch_checklist c join launch_checklist_template x on x.code = c.code
      where c.plan_id = new.plan_id and x.tag in ('MCFD','LAW') and not x.after_gate and c.code <> 'go_no_go'
        and c.done_on is null and not c.not_applicable;
      if open_count > 0 then
        raise exception 'CEO go/no-go is locked: % MCFD/legal item(s) are still open.', open_count;
      end if;
    end if;
    if t.after_gate then
      select (done_on is not null) into gate_done from launch_checklist where plan_id = new.plan_id and code = 'go_no_go';
      if not coalesce(gate_done, false) then
        raise exception 'This item comes after the CEO go/no-go sign-off.';
      end if;
    end if;
  end if;
  -- Re-opening a signed executive item also needs the same level.
  if (old.done_on is not null or old.not_applicable) and not (new.done_on is not null or new.not_applicable) then
    if app_level() < t.min_level then raise exception 'Only level % or above can re-open this item.', t.min_level; end if;
    new.done_by := null;
  end if;
  return new;
end $$;
drop trigger if exists launch_checklist_rules on launch_checklist;
create trigger launch_checklist_rules before update on launch_checklist for each row execute function launch_checklist_rules();

-- A plan can't be marked Complete until the CEO go/no-go is signed.
create or replace function launch_plan_complete_gate() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Complete' and old.status is distinct from 'Complete'
     and exists (select 1 from launch_checklist where plan_id = new.id and code = 'go_no_go' and done_on is null) then
    raise exception 'The plan can''t be marked Complete until the CEO go/no-go is signed on the House checklist.';
  end if;
  return new;
end $$;
drop trigger if exists launch_plans_complete_gate on launch_plans;
create trigger launch_plans_complete_gate before update on launch_plans for each row execute function launch_plan_complete_gate();

-- What the page shows: due date from the contract effective date, and status.
create or replace view launch_checklist_due with (security_invoker = true) as
select c.id, c.plan_id, c.code, t.sort, t.part, t.item, t.tag, t.owner_role, t.day, t.due_note, t.min_level, t.after_gate,
       c.done_on, c.done_by, pr.full_name as done_by_name, c.not_applicable, c.note, c.file_path, c.file_name,
       case when p.contract_effective_date is not null and t.day is not null then p.contract_effective_date + t.day end as due_date,
       case when c.done_on is not null then 'Done'
            when c.not_applicable then 'N/A'
            when p.contract_effective_date is null then 'Waiting for contract date'
            when p.contract_effective_date + t.day < current_date then 'Overdue'
            when p.contract_effective_date + t.day <= current_date + 7 then 'Due this week'
            else 'To do' end as due_status
from launch_checklist c
join launch_checklist_template t on t.code = c.code
join launch_plans p on p.id = c.plan_id
left join profiles pr on pr.id = c.done_by;

select count(*) as checklist_items, count(distinct plan_id) as plans from launch_checklist;
