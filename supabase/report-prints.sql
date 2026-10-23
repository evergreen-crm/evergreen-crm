-- =====================================================================
-- Evergreen CRM - Printed reports log. Safe to run again.
-- Every time someone opens or prints a documentation report, a row is saved here:
-- who, which report, which house or person, which dates, and when.
-- Program Coordinators and up can add their own rows; Director of Operations (level 4) and up can read them.
-- Rows can't be changed or deleted from the app.
-- =====================================================================
create table if not exists report_prints (
  id          uuid primary key default gen_random_uuid(),
  report      text not null,                       -- e.g. 'daily-documentation'
  action      text not null check (action in ('opened', 'printed')),
  home_id     uuid references homes on delete set null,
  resident_id uuid references residents on delete set null,
  date_from   date,
  date_to     date,
  sections    text[],
  printed_by  uuid not null default auth.uid() references profiles,   -- an account with printed reports is deactivated, not deleted
  printed_at  timestamptz not null default now()
);
create index if not exists report_prints_at on report_prints (printed_at desc);

alter table report_prints enable row level security;
drop policy if exists rp_insert on report_prints;
drop policy if exists rp_read on report_prints;
create policy rp_insert on report_prints for insert
  with check (printed_by = auth.uid() and app_level() >= 2);
create policy rp_read on report_prints for select
  using (printed_by = auth.uid() or app_level() >= 4);

-- Check: should say 0 (or the number of rows already saved)
select count(*) as report_prints_rows from report_prints;
