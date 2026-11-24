-- Positions (Nov 24 2026, Phase A1 of the Roles plan): every Evergreen position, its access level, who it reports
-- to, its program and how it is paid. Pay positions (pay_rates) link to a position by position_key, so HR's pay
-- table and the offer letters use the same names. A person can also hold a second role (Clinical Lead, Board
-- member) in staff_details.also_roles. Offer letters already sent keep the position name they were sent with.

create table if not exists public.positions (
  key         text primary key,
  title       text not null,
  level       int not null check (level between 1 and 8),
  staff_group text check (staff_group in ('hr', 'payroll')),
  reports_to  text,
  program     text not null default 'Both' check (program in ('MCFD', 'CLBC', 'Both')),
  pay_basis   text not null check (pay_basis in ('hourly', 'salary', 'none')),
  employee    boolean not null default true,    -- false: Board of Directors (appointed, not employed)
  also_role   boolean not null default false,   -- can be held together with another position
  summary     text,
  sort        int not null default 100,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table public.positions enable row level security;
drop policy if exists "positions read" on public.positions;
create policy "positions read" on public.positions for select to authenticated using (true);
drop policy if exists "positions admin" on public.positions;
create policy "positions admin" on public.positions for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into public.positions (key, title, level, staff_group, reports_to, program, pay_basis, employee, also_role, summary, sort) values
 ('cyw', 'Child & Youth Care Worker', 1, null, 'pc', 'MCFD', 'hourly', true, false, 'Direct care of children and youth in an MCFD home, on shift, following the shift checklist and each youth''s plan of care.', 10),
 ('csw', 'Community Support Worker', 1, null, 'pc', 'CLBC', 'hourly', true, false, 'Direct support of adults in a CLBC home or service, following each person''s Individual Support Plan.', 20),
 ('team_leader', 'Team Leader', 1, null, 'pc', 'Both', 'hourly', true, false, 'A Child & Youth Care Worker or Community Support Worker who also leads the team on shift: handover, shift checklist sign-off, first contact for staff on shift.', 30),
 ('pc', 'Program Coordinator', 2, null, 'pm', 'Both', 'salary', true, false, 'Runs one or two homes day to day: staffing, plans of care, notes and incident review, family and social worker contact.', 40),
 ('pm', 'Program Manager', 3, null, 'doo', 'Both', 'salary', true, false, 'Oversees the homes assigned to them: quality, compliance, approvals, coordinators, and the funder relationship.', 50),
 ('clinical_lead', 'Clinical Lead', 3, null, 'ed', 'Both', 'salary', true, true, 'Clinical oversight: behaviour support plans, restricted practices, medication and health practice, clinical training. Currently held by a board member.', 60),
 ('hr', 'HR', 2, 'hr', 'ed', 'Both', 'salary', true, false, 'Hiring, onboarding, staff files, certificates and training records, policy sign-offs, letters.', 70),
 ('payroll', 'Payroll', 2, 'payroll', 'ed', 'Both', 'salary', true, false, 'Timesheets, pay runs, pay rates and changes, remittances and year-end.', 80),
 ('doo', 'Director of Operations', 4, null, 'ed', 'Both', 'salary', true, false, 'All homes: admissions, licensing, organization-wide reports, program managers.', 90),
 ('ed', 'Executive Director', 5, null, 'ceo', 'Both', 'salary', true, false, 'Runs the organization: funder contracts, finance, policy, accreditation, the directors and HR.', 100),
 ('cso', 'Chief Strategic Officer', 6, null, 'ceo', 'Both', 'salary', true, false, 'Strategy and growth: new programs and contracts, budgets, partnerships, the strategic plan.', 110),
 ('ceo', 'Chief Executive Officer', 7, null, 'board', 'Both', 'salary', true, false, 'Leads Evergreen and answers to the Board: direction, major decisions, risk and the security audit.', 120),
 ('board', 'Board of Directors', 8, null, null, 'Both', 'none', false, true, 'Governance: approves policies, budgets and the strategic plan, appoints and reviews the CEO. Appointed, not employed.', 130)
on conflict (key) do update set title = excluded.title, level = excluded.level, staff_group = excluded.staff_group,
  reports_to = excluded.reports_to, program = excluded.program, pay_basis = excluded.pay_basis, employee = excluded.employee,
  also_role = excluded.also_role, summary = excluded.summary, sort = excluded.sort, updated_at = now();

-- Pay positions link to a position; frontline names follow the position names.
alter table public.pay_rates add column if not exists position_key text references public.positions(key);

do $$
declare r record;
begin
  for r in select * from (values ('Youth Worker','Child & Youth Care Worker'), ('Support Worker I','Community Support Worker I'),
      ('Support Worker II','Community Support Worker II'), ('Senior / Lead Support Worker','Team Leader')) v(o, n) loop
    if not exists (select 1 from pay_rates where lower(position) = lower(r.n)) then
      update pay_rates set position = r.n where position = r.o;
      update pay_plans set position = r.n where position = r.o;
      update pay_changes set position = r.n where position = r.o;
      update staff_details set position = r.n where position = r.o;
    end if;
  end loop;
end $$;

insert into public.pay_rates (position, sort) values
 ('Clinical Lead', 70), ('HR', 80), ('Payroll', 90), ('Director of Operations', 100),
 ('Executive Director', 110), ('Chief Strategic Officer', 120), ('Chief Executive Officer', 130)
on conflict do nothing;
insert into public.pay_plans (position, program, pay_type)
select r.position, 'All', 'salary' from pay_rates r
 where r.position in ('Clinical Lead', 'HR', 'Payroll', 'Director of Operations', 'Executive Director', 'Chief Strategic Officer', 'Chief Executive Officer')
on conflict (position, program) do nothing;

update public.pay_rates set position_key = case position
  when 'Child & Youth Care Worker' then 'cyw'
  when 'Community Support Worker I' then 'csw'
  when 'Community Support Worker II' then 'csw'
  when 'Team Leader' then 'team_leader'
  when 'Program Coordinator' then 'pc'
  when 'Program Manager' then 'pm'
  when 'Clinical Lead' then 'clinical_lead'
  when 'HR' then 'hr'
  when 'Payroll' then 'payroll'
  when 'Director of Operations' then 'doo'
  when 'Executive Director' then 'ed'
  when 'Chief Strategic Officer' then 'cso'
  when 'Chief Executive Officer' then 'ceo'
  else position_key end;

-- A second role held with the main position (e.g. a board member who is also the Clinical Lead).
alter table public.staff_details add column if not exists also_roles text[] not null default '{}';
