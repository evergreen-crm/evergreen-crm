-- =====================================================================
-- Evergreen CRM - Payroll export (plan B2, Nov 20, 2026).
-- Payroll downloads approved hours for a pay period as a file for the payroll provider. Each download is logged,
-- so the page shows "sent on ... by ..." and warns when hours were approved or changed after the last download.
-- Who: Payroll, the Administrator, CSO and CEO (level 6+).
-- Run as migration payroll_export. Safe to re-run.
-- =====================================================================
create table if not exists public.payroll_exports (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  exported_by uuid references public.profiles(id) default auth.uid(),
  exported_at timestamptz not null default now(),
  people int not null default 0,
  total_hours numeric not null default 0,
  not_approved int not null default 0
);
create index if not exists payroll_exports_period on public.payroll_exports (period_start, exported_at desc);
alter table public.payroll_exports enable row level security;

create or replace function public.can_export_payroll() returns boolean
language sql stable security definer set search_path = public as $$
  select app_role() = 'admin' or coalesce(app_group(), '') = 'payroll'
      or (coalesce(app_level(), 0) >= 6 and coalesce(app_group(), '') = '');
$$;
revoke execute on function public.can_export_payroll() from public, anon;
grant execute on function public.can_export_payroll() to authenticated;

drop policy if exists payroll_exports_read on public.payroll_exports;
create policy payroll_exports_read on public.payroll_exports for select using (can_export_payroll());
drop policy if exists payroll_exports_add on public.payroll_exports;
create policy payroll_exports_add on public.payroll_exports for insert with check (can_export_payroll() and exported_by = auth.uid());

-- Payroll needs approved vacation and sick days for the export.
drop policy if exists "timeoff payroll see" on public.time_off_requests;
create policy "timeoff payroll see" on public.time_off_requests for select using (coalesce(app_group(), '') = 'payroll' and status = 'Approved');
