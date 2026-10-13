-- Evergreen staff ID numbers, created automatically:  EVG-YYMM-POS-P-NNNN
--   EVG   Evergreen
--   YYMM  year and month of hire (from staff_details.hire_date; the account's start date until a hire date is entered)
--   POS   position: YW Youth Worker (1) · PC Program Coordinator (2) · HR · PY Payroll · PM Program Manager (3)
--         DO Director of Operations (4) · ED Executive Director (5) · CS CSO (6) · CE CEO (7) · AD Administrator (8)
--   P     program: M = MCFD · C = CLBC · B = Both
--   NNNN  the person's permanent staff number — never changes and is never reused
-- Example: EVG-2610-YW-M-0007 = hired October 2026, Youth Worker, MCFD program, staff #7.
-- The number updates itself when the hire date, program or position changes; the last 4 digits always stay the same.
-- The old number is kept in employee_no_previous. Safe to run more than once.

alter table staff_details add column if not exists employee_seq int unique;
alter table staff_details add column if not exists employee_no_previous text;
create sequence if not exists employee_no_seq start 1;

-- Keep everyone's existing staff number (EVG-0007 → 7).
update staff_details set employee_seq = substring(employee_no from '(\d+)$')::int
where employee_seq is null and employee_no ~ '\d+$'
  and not exists (select 1 from staff_details x where x.employee_seq = substring(staff_details.employee_no from '(\d+)$')::int);
select setval('employee_no_seq', greatest((select coalesce(max(employee_seq), 0) from staff_details), (select last_value from employee_no_seq)));
update staff_details set employee_seq = nextval('employee_no_seq') where employee_seq is null;

create or replace function staff_position_code(pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p.role = 'admin' then 'AD'
    when p.staff_group = 'hr' then 'HR'
    when p.staff_group = 'payroll' then 'PY'
    else case coalesce(p.level, case p.role when 'manager' then 3 else 1 end)
      when 1 then 'YW' when 2 then 'PC' when 3 then 'PM' when 4 then 'DO'
      when 5 then 'ED' when 6 then 'CS' when 7 then 'CE' else 'AD' end
  end
  from profiles p where p.id = pid;
$$;

create or replace function build_employee_no(pid uuid, hire date, prog text, seq int) returns text
language sql stable security definer set search_path = public as $$
  select 'EVG-'
    || to_char(coalesce(hire, (select p.created_at::date from profiles p where p.id = pid), current_date), 'YYMM') || '-'
    || coalesce(staff_position_code(pid), 'YW') || '-'
    || case prog when 'MCFD' then 'M' when 'CLBC' then 'C' else 'B' end || '-'
    || lpad(seq::text, 4, '0');
$$;

-- Replaces the old EVG-0001 trigger: builds the number on insert and whenever hire date or program changes.
create or replace function set_employee_no() returns trigger language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if new.employee_seq is null then new.employee_seq := nextval('employee_no_seq'); end if;
  v := build_employee_no(new.profile_id, new.hire_date, new.program, new.employee_seq);
  if tg_op = 'UPDATE' and old.employee_no is distinct from v and old.employee_no is not null then
    new.employee_no_previous := old.employee_no;
  end if;
  new.employee_no := v;
  return new;
end $$;
drop trigger if exists staff_details_employee_no on staff_details;
create trigger staff_details_employee_no before insert or update of hire_date, program, employee_seq on staff_details
  for each row execute function set_employee_no();

-- A promotion or move (level, HR/Payroll group, admin) updates the position code.
create or replace function profile_employee_no_refresh() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update staff_details set program = program where profile_id = new.id;
  return new;
end $$;
drop trigger if exists profiles_employee_no on profiles;
create trigger profiles_employee_no after update of level, staff_group, role on profiles
  for each row when (old.level is distinct from new.level or old.staff_group is distinct from new.staff_group or old.role is distinct from new.role)
  execute function profile_employee_no_refresh();

-- Give everyone their new number now.
update staff_details set program = program;

select s.employee_no, s.employee_no_previous, p.full_name from staff_details s join profiles p on p.id = s.profile_id order by s.employee_seq;
