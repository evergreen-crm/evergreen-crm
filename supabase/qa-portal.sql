-- =====================================================================
-- Evergreen CRM - Quality assurance portal (COA standards), Phase 1. Safe to run again.
-- The QA portal (/qa) is for Director of Operations and up (level 4+). It reads the records the
-- CRM already keeps (incidents, restraints, missing youth, medications, certificates, training,
-- policies, fire drills, inspections, corrective actions). This file only adds the access log:
-- every QA page view is recorded (who, which page, when), and only level 4+ can read it.
-- =====================================================================

create table if not exists qa_view_log (
  id        bigint generated always as identity primary key,
  viewer_id uuid not null default auth.uid() references profiles,
  page      text not null check (length(page) <= 120),
  viewed_at timestamptz not null default now()
);
create index if not exists qa_view_log_at on qa_view_log (viewed_at desc);

alter table qa_view_log enable row level security;
drop policy if exists qa_log_add on qa_view_log;
drop policy if exists qa_log_read on qa_view_log;
-- Only level 4+ can open the portal, so only they write; each row is their own.
create policy qa_log_add on qa_view_log for insert to authenticated
  with check (viewer_id = auth.uid() and coalesce(app_level(), 0) >= 4);
create policy qa_log_read on qa_view_log for select to authenticated
  using (coalesce(app_level(), 0) >= 4);
-- No update or delete: the log can't be changed.

-- Check: should say 1
select count(*) as qa_log_table from information_schema.tables where table_name = 'qa_view_log';
