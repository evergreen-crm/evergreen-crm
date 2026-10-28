-- =====================================================================
-- Evergreen CRM - Staff file records: performance evaluations and supervision (MCFD standards G.1.10(a)(9), G.4.3, G.4.5(d)).
-- Rehire recommendation and exit interview already live in staff_details (rehire_eligible, exit_interview_on).
-- Who can write: Program Managers and up (level 3+) and admins. The staff member can read their own records.
-- Safe to run more than once.
-- =====================================================================

create table if not exists staff_file_records (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles on delete cascade,
  kind         text not null check (kind in ('performance_evaluation', 'supervision', 'job_description_acknowledged')),
  record_on    date not null,
  summary      text not null,
  rating       text check (rating in ('Meets expectations', 'Exceeds expectations', 'Needs improvement', 'Not rated')),
  next_due_on  date,
  written_by   uuid references profiles default auth.uid(),
  created_at   timestamptz not null default now(),
  check (next_due_on is null or next_due_on >= record_on)
);
create index if not exists sfr_profile_idx on staff_file_records (profile_id, kind, record_on desc);
alter table staff_file_records enable row level security;

drop policy if exists sfr_read on staff_file_records;
create policy sfr_read on staff_file_records for select
  using (profile_id = auth.uid() or app_level() >= 3 or exists (select 1 from profiles a where a.id = auth.uid() and a.role = 'admin'));

drop policy if exists sfr_write on staff_file_records;
create policy sfr_write on staff_file_records for insert
  with check (app_level() >= 3 or exists (select 1 from profiles a where a.id = auth.uid() and a.role = 'admin'));
