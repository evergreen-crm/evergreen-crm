-- =====================================================================
-- Evergreen CRM - Monthly records download (plan E4, Nov 20, 2026).
-- A stopgap backup until the nightly OneDrive backup is set up: once a month the Administrator downloads every
-- record as Excel workbooks (one per area; one sheet per table). Uploaded files themselves (PDFs, photos) are not
-- included, only their records. Each download is logged; from the 1st of each month the Administrator is
-- reminded until that month's download is done.
-- Administrator only. Run as migration records_export. Safe to re-run.
-- =====================================================================
create table if not exists public.records_exports (
  id uuid primary key default gen_random_uuid(),
  area text not null check (length(area) <= 40),
  tables int not null default 0,
  rows_total int not null default 0,
  exported_by uuid references public.profiles(id) default auth.uid(),
  exported_at timestamptz not null default now()
);
create index if not exists records_exports_at on public.records_exports (exported_at desc);
alter table public.records_exports enable row level security;
drop policy if exists records_exports_read on public.records_exports;
create policy records_exports_read on public.records_exports for select using (app_role() = 'admin' or (coalesce(app_level(), 0) >= 7 and coalesce(app_group(), '') = ''));
drop policy if exists records_exports_add on public.records_exports;
create policy records_exports_add on public.records_exports for insert with check (app_role() = 'admin' and exported_by = auth.uid());

-- Every table in the public schema with its columns (used by the server to build the workbooks).
create or replace function public.export_table_list()
returns table (table_name text, columns text[])
language sql stable security definer set search_path = public as $$
  select c.relname::text, array_agg(a.attname::text order by a.attnum)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
   where n.nspname = 'public' and c.relkind = 'r'
   group by c.relname order by c.relname;
$$;
revoke execute on function public.export_table_list() from public, anon, authenticated;
grant execute on function public.export_table_list() to service_role;

-- Daily job: remind the Administrator(s) from the 1st of the month until this month's download is done.
create or replace function public.records_export_remind() returns int
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', (now() at time zone evg_tz()))::date; d int := extract(day from (now() at time zone evg_tz()))::int; a record; n int := 0;
begin
  if exists (select 1 from records_exports where (exported_at at time zone evg_tz())::date >= m) then return 0; end if;
  for a in select id from profiles where role = 'admin' and active loop
    perform notify(a.id, 'Monthly records download due',
      'Download this month''s copy of all portal records (Admin → Records download) and save it in the secure Evergreen folder.',
      '/admin/records-download', 'records-export-' || a.id || '-' || to_char(m, 'YYYY-MM') || case when d >= 10 then '-2' else '' end);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.records_export_remind() from public, anon, authenticated;
grant execute on function public.records_export_remind() to service_role;
