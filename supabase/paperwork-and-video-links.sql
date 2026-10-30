-- =====================================================================
-- Evergreen CRM - Paperwork PDFs and OneDrive video links (Oct 30, 2026).
-- 1. paperwork_pdfs: every signed onboarding paper (offer, orientation acknowledgement, policies) and every
--    passed Academy course makes a PDF, kept in the staff-files bucket under <person>/paperwork/.
--    Staff see their own; HR, Admin and directors (level 4+) see everyone's; PCs and PMs see the staff of
--    the homes they can see. Only the server writes rows. onedrive_status is for the OneDrive copy job
--    (built with the nightly backup, after the Microsoft app registration).
-- 2. training_videos: a OneDrive (or other https) link per Academy course, used instead of an uploaded
--    video when set. Everyone signed in can read; CSO, CEO and Admin (level 6+) set them.
-- Run as migration paperwork_and_video_links. Safe to run more than once.
-- =====================================================================
create table if not exists paperwork_pdfs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('signed', 'course')),
  title text not null,
  source_id text not null,
  file_path text not null,
  sha256 text not null,
  onedrive_status text not null default 'waiting' check (onedrive_status in ('waiting', 'copied', 'failed')),
  created_at timestamptz not null default now(),
  unique (kind, source_id)
);
create index if not exists paperwork_pdfs_person on paperwork_pdfs (profile_id, created_at desc);
alter table paperwork_pdfs enable row level security;

drop policy if exists paperwork_read on paperwork_pdfs;
create policy paperwork_read on paperwork_pdfs for select using (
  profile_id = auth.uid()
  or app_role() = 'admin'
  or coalesce(app_group(), '') = 'hr'
  or coalesce(app_level(), 0) >= 4
  or (coalesce(app_level(), 0) between 2 and 3 and coalesce(app_group(), '') = ''
      and exists (select 1 from profiles p where p.id = paperwork_pdfs.profile_id and app_sees_home(p.home_id)))
);
-- No insert/update/delete policies: rows are written by the server (secret key) only.

create table if not exists training_videos (
  course_key text primary key,
  url text not null check (url ~ '^https://'),
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
alter table training_videos enable row level security;

drop policy if exists tv_read on training_videos;
create policy tv_read on training_videos for select using (auth.uid() is not null);
drop policy if exists tv_write on training_videos;
create policy tv_write on training_videos for all
  using (app_role() = 'admin' or coalesce(app_level(), 0) >= 6)
  with check (app_role() = 'admin' or coalesce(app_level(), 0) >= 6);
