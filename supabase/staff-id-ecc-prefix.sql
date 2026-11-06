-- =====================================================================
-- Evergreen CRM - Staff ID prefix ECC (Nov 6, 2026).
-- Staff ID numbers (supabase/staff-id-numbers.sql) now start with ECC (Evergreen Community Care) instead of EVG:
--     ECC-2611-YW-M-0010 = hired Nov 2026 · Youth Worker · MCFD · staff #0010
-- Made automatically when a person is added; updates itself if hire date, program or position changes (the
-- last 4 digits never change and are never reused); a changed number flags the printed ID card for a reprint.
-- Also removes a duplicate numbering attempt from earlier today and restores the original triggers.
-- Run as migration staff_id_ecc_prefix. Safe to re-run.
-- =====================================================================
drop trigger if exists profiles_employee_no_after on public.profiles;
drop trigger if exists profiles_employee_no on public.profiles;
drop trigger if exists staff_details_employee_no on public.staff_details;
drop function if exists public.profiles_employee_no_after();
drop function if exists public.profiles_employee_no();
drop function if exists public.staff_details_employee_no();
drop function if exists public.refresh_employee_no(uuid);
drop function if exists public.employee_no_for(uuid, int);
alter table public.profiles drop column if exists employee_no;
alter table public.profiles drop column if exists employee_seq;

create or replace function build_employee_no(pid uuid, hire date, prog text, seq int) returns text
language sql stable security definer set search_path = public as $$
  select 'ECC-'
    || to_char(coalesce(hire, (select p.created_at::date from profiles p where p.id = pid), current_date), 'YYMM') || '-'
    || coalesce(staff_position_code(pid), 'YW') || '-'
    || case prog when 'MCFD' then 'M' when 'CLBC' then 'C' else 'B' end || '-'
    || lpad(seq::text, 4, '0');
$$;

create trigger staff_details_employee_no before insert or update of hire_date, program, employee_seq on staff_details
  for each row execute function set_employee_no();
create trigger profiles_employee_no after update of level, staff_group, role on profiles
  for each row when (old.level is distinct from new.level or old.staff_group is distinct from new.staff_group or old.role is distinct from new.role)
  execute function profile_employee_no_refresh();

select setval('employee_no_seq', greatest((select coalesce(max(employee_seq), 0) from staff_details), 1));

-- Re-number everyone with the ECC prefix (same staff numbers); the EVG number is kept as the previous number.
update staff_details set program = program;
