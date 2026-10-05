-- =====================================================================
-- Evergreen CRM - KPI Phase 2: automatic daily job, reminder emails,
-- weekly summary and monthly scorecard snapshots.
-- Run once in Supabase SQL Editor (after kpi-actions.sql). Safe to run again.
-- =====================================================================

-- One row per month. The daily job updates the current month's row every morning,
-- so the last run of a month holds the month-end figures (used for the trend on the KPI page).
create table if not exists kpi_snapshots (
  month       date primary key,          -- first day of the month
  taken_on    date not null,
  overall     numeric,
  scorecard   jsonb not null default '[]',
  kpis        jsonb not null default '[]',
  updated_at  timestamptz not null default now()
);
alter table kpi_snapshots enable row level security;
drop policy if exists "snapshots see" on kpi_snapshots;
create policy "snapshots see" on kpi_snapshots for select using (app_level() >= 2);
-- No insert/update policy: only the daily job (server, secret key) writes snapshots.

-- A record of every automatic run (what it found and sent).
create table if not exists automation_runs (
  id        uuid primary key default gen_random_uuid(),
  job       text not null default 'daily',
  trigger   text not null default 'cron',   -- cron = automatic, manual = "Run now" button
  ran_at    timestamptz not null default now(),
  ok        boolean not null default true,
  summary   jsonb
);
create index if not exists automation_runs_idx on automation_runs (ran_at desc);
alter table automation_runs enable row level security;
drop policy if exists "runs see" on automation_runs;
create policy "runs see" on automation_runs for select using (app_level() >= 3);

-- Each person can turn their own reminder emails on or off (default on).
alter table profiles add column if not exists email_alerts boolean not null default true;

create or replace function set_my_email_alerts(on_off boolean) returns void
language sql security definer set search_path = public as $$
  update profiles set email_alerts = on_off where id = auth.uid();
$$;
revoke all on function set_my_email_alerts(boolean) from public, anon;
grant execute on function set_my_email_alerts(boolean) to authenticated;

-- KPI owners: the CEO / Director of Operations (level 4+) assigns one person to each KPI.
-- That person receives the action items for the KPI and is named on the KPI page and weekly summary.
create table if not exists kpi_owners (
  kpi_key      text primary key,          -- e.g. training, care_plans, fire_drills
  owner_id     uuid references profiles on delete set null,
  assigned_by  uuid references profiles default auth.uid(),
  assigned_at  timestamptz not null default now()
);
alter table kpi_owners enable row level security;
drop policy if exists "kpi owners see" on kpi_owners;
drop policy if exists "kpi owners set" on kpi_owners;
create policy "kpi owners see" on kpi_owners for select using (app_level() >= 1);
create policy "kpi owners set" on kpi_owners for all using (app_level() >= 4) with check (app_level() >= 4);
drop trigger if exists audit_kpi_owners on kpi_owners;
create trigger audit_kpi_owners after insert or update or delete on kpi_owners for each row execute function write_audit();
