-- =====================================================================
-- Evergreen CRM - 📨 Automatic reference checks. Safe to run more than once. Run after prescreen.sql,
-- staff-groups.sql and onboarding.sql.
--
-- Melvin, Oct 26 2026: 3 professional references, supervisors only, with agency, email and phone.
-- As soon as the details are given, each reference is emailed a private form; reminders go out until they answer.
--  · Applicants (job prescreen) and new staff (onboarding) both give 3 supervisor references.
--  · Each reference gets an email right away with a private link (no account). Reminders after 3, 7 and 12 days.
--    The link closes after 21 days; HR is then told to phone that reference.
--  · When a reference answers, HR is alerted and the applicant's reference check is filled in automatically.
--  · Answers are confidential: only HR, people with screening access and the administrator see them.
--    The staff member / applicant only sees whether each reference has answered.
-- =====================================================================

create table if not exists reference_requests (
  id                 uuid primary key default gen_random_uuid(),
  prescreen_id       uuid references prescreens on delete cascade,
  profile_id         uuid references profiles on delete cascade,
  idx                int not null check (idx between 0 and 2),
  about_name         text not null,             -- the applicant / staff member
  position           text,
  ref_name           text not null,
  ref_title          text,
  ref_org            text,                      -- agency / organization
  ref_relation       text,
  ref_email          text not null,
  ref_phone          text,
  token              text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status             text not null default 'Sent' check (status in ('Sent', 'Opened', 'Completed', 'Expired', 'Cancelled', 'Not sent')),
  send_error         text,
  sent_at            timestamptz,
  opened_at          timestamptz,
  reminders          int not null default 0,
  last_reminded_at   timestamptz,
  expires_at         timestamptz not null default now() + interval '21 days',
  completed_at       timestamptz,
  answers            jsonb,
  confirms_supervised boolean,
  rehire             text,
  concern            boolean,
  signed_name        text,
  signer_ip          text,
  created_by         uuid references profiles on delete set null,
  created_at         timestamptz not null default now(),
  check (prescreen_id is not null or profile_id is not null)
);
create index if not exists reference_requests_ps on reference_requests (prescreen_id, idx);
create index if not exists reference_requests_staff on reference_requests (profile_id, idx);
create index if not exists reference_requests_open on reference_requests (status, expires_at) where status in ('Sent', 'Opened');

alter table reference_requests enable row level security;
drop policy if exists "refreq see" on reference_requests;
-- HR, screening access and the administrator. Changes go through the server only.
create policy "refreq see" on reference_requests for select using (prescreen_role() is not null or app_role() = 'admin');

-- What a staff member sees about their own references: who, and whether they answered. Never the answers.
create or replace function my_references()
returns table (idx int, ref_name text, ref_org text, status text, sent_at timestamptz, completed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (r.idx) r.idx, r.ref_name, r.ref_org,
         case when r.status in ('Sent', 'Opened') then 'Waiting' else r.status end, r.sent_at, r.completed_at
    from reference_requests r
   where r.profile_id = auth.uid() and r.status <> 'Cancelled'
   order by r.idx, r.created_at desc;
$$;
grant execute on function my_references() to authenticated;

-- Check
select 'reference checks ready' as result, (select count(*) from reference_requests) as requests;
