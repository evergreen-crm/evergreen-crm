-- =====================================================================
-- Evergreen CRM - Bulk import of real staff (plan E3, Nov 20, 2026).
-- The Administrator uploads the filled-in template; the checked rows are kept here for the preview, then imported.
-- Each batch keeps what was imported and the result for each row (a record of who added whom, and when).
-- Administrator only. Run as migration staff_import. Safe to re-run.
-- =====================================================================
create table if not exists public.staff_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text check (length(file_name) <= 200),
  rows jsonb not null default '[]'::jsonb check (pg_column_size(rows) < 2000000),
  status text not null default 'Preview' check (status in ('Preview','Imported','Cancelled')),
  send_offers boolean,
  results jsonb,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  imported_at timestamptz
);
alter table public.staff_import_batches enable row level security;
drop policy if exists staff_import_admin on public.staff_import_batches;
create policy staff_import_admin on public.staff_import_batches for all using (app_role() = 'admin') with check (app_role() = 'admin');
