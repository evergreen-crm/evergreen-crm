-- =====================================================================
-- Evergreen CRM - Quality assurance (COA) Phase 2. Safe to run again. Run after qa-portal.sql.
--  1. Automatic satisfaction surveys (youth, parents/guardians, social workers, funders, staff, new hires,
--     job applicants, referral sources). The nightly job creates and emails them; people answer from a
--     private link (no account). Results feed the QA portal.
--  2. Monthly QA review: each PC (own house), PM and director records a review every month.
--  3. COA standards tracker + evidence binder (directors only).
--  4. Resident file audits (directors only).
-- =====================================================================

-- ---------- Contacts on the resident file (for surveys) ----------
alter table residents add column if not exists guardian_email text;
alter table residents add column if not exists funder_contact_name text;
alter table residents add column if not exists funder_contact_email text;

-- ---------- 1. Surveys ----------
create table if not exists survey_sends (
  id              uuid primary key default gen_random_uuid(),
  survey_key      text not null check (survey_key in ('youth','family','social_worker','funder','staff','new_hire','applicant','referral')),
  reason          text not null,                 -- 3-month, 6-month, 12-month, discharge, 90-day, annual, hiring, intake
  dedupe_key      text not null unique,          -- one survey per person per occasion
  resident_id     uuid references residents on delete set null,
  home_id         uuid references homes,
  profile_id      uuid references profiles on delete set null,  -- staff surveys
  recipient_name  text,
  recipient_email text,
  token           text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status          text not null default 'Sent' check (status in ('Waiting','Sent','Completed','Expired','Cancelled')),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  reminders       int not null default 0,
  reminded_at     timestamptz,
  expires_at      timestamptz not null default now() + interval '30 days',
  opened_at       timestamptz,
  completed_at    timestamptz,
  answers         jsonb,
  score           numeric(3,2),                  -- average of the 1–5 answers
  concern         boolean not null default false, -- a safety "no" or a score under 3
  comments        text,
  followup_id     uuid references action_items on delete set null
);
create index if not exists survey_sends_home on survey_sends (home_id, created_at desc);
create index if not exists survey_sends_status on survey_sends (status, sent_at);
alter table survey_sends enable row level security;

-- Directors see everything; a Program Manager sees all houses; a Program Coordinator sees their own house.
-- Staff surveys (staff, new_hire) are seen by directors only, so staff can answer honestly.
create or replace function can_see_survey(p_home uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_level(), 0) >= 4
      or (p_key not in ('staff','new_hire','applicant') and app_group() is null and (
            coalesce(app_level(), 0) = 3
            or (coalesce(app_level(), 0) = 2 and p_home is not null and p_home = app_home())));
$$;
grant execute on function can_see_survey(uuid, text) to authenticated;
drop policy if exists survey_read on survey_sends;
create policy survey_read on survey_sends for select to authenticated using (can_see_survey(home_id, survey_key));
-- No insert/update from the app: the nightly job and the public answer page use the server key.
revoke select on survey_sends from anon, authenticated;
grant select (id, survey_key, reason, resident_id, home_id, profile_id, recipient_name, recipient_email, status, created_at, sent_at,
  reminders, reminded_at, expires_at, opened_at, completed_at, answers, score, concern, comments, followup_id) on survey_sends to authenticated;

-- The youth survey is done in person: staff at the house open the link on a phone or tablet with the youth.
create or replace function survey_youth_link(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select s.token from survey_sends s
   where s.id = p_id and s.survey_key = 'youth' and s.status in ('Waiting','Sent') and s.expires_at > now()
     and (coalesce(app_level(), 0) >= 3 or (coalesce(app_level(), 0) >= 1 and s.home_id = app_home()));
$$;
grant execute on function survey_youth_link(uuid) to authenticated;

-- ---------- 2. Monthly QA review ----------
create table if not exists qa_monthly_reviews (
  id          uuid primary key default gen_random_uuid(),
  month       date not null,                 -- first day of the month reviewed
  home_id     uuid references homes,         -- empty = whole organization (directors)
  reviewer_id uuid not null default auth.uid() references profiles,
  went_well   text,
  concerns    text,
  actions     text,
  created_at  timestamptz not null default now(),
  unique (month, home_id, reviewer_id)
);
alter table qa_monthly_reviews enable row level security;
drop policy if exists qmr_add on qa_monthly_reviews;
drop policy if exists qmr_read on qa_monthly_reviews;
create policy qmr_add on qa_monthly_reviews for insert to authenticated with check (
  reviewer_id = auth.uid() and app_group() is null and coalesce(app_level(), 0) >= 2
  and (coalesce(app_level(), 0) >= 3 or (home_id is not null and home_id = app_home())));
create policy qmr_read on qa_monthly_reviews for select to authenticated using (
  reviewer_id = auth.uid() or coalesce(app_level(), 0) >= 3
  or (coalesce(app_level(), 0) = 2 and app_group() is null and home_id = app_home()));

-- ---------- 3. COA standards tracker + evidence ----------
create table if not exists qa_standards (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,           -- e.g. PQI, or a standard number like PQI 2
  area       text not null,                  -- COA section code: PQI, RPM, HR, ...
  title      text not null,
  status     text not null default 'Not started' check (status in ('Not started','In progress','Met','Partially met','Not met','N/A')),
  owner_id   uuid references profiles,
  due_date   date,
  notes      text,
  updated_by uuid references profiles default auth.uid(),
  updated_at timestamptz not null default now()
);
create table if not exists qa_evidence (
  id          uuid primary key default gen_random_uuid(),
  standard_id uuid not null references qa_standards on delete cascade,
  title       text not null,
  link        text,                          -- a CRM page (/policies, /portal/record/...) or a web address
  file_path   text,                          -- uploaded file in the qa-evidence storage
  file_name   text,
  added_by    uuid references profiles default auth.uid(),
  added_at    timestamptz not null default now(),
  check (link is not null or file_path is not null)
);
-- ---------- 4. Resident file audits ----------
create table if not exists qa_file_audits (
  id          uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents on delete cascade,
  home_id     uuid references homes,
  audit_date  date not null default current_date,
  auditor_id  uuid not null default auth.uid() references profiles,
  answers     jsonb not null default '{}'::jsonb,   -- checklist item -> yes / no / n/a
  score       int,                                  -- % of applicable items met
  findings    text,
  action_id   uuid references action_items on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists qa_file_audits_res on qa_file_audits (resident_id, audit_date desc);

alter table qa_standards enable row level security;
alter table qa_evidence enable row level security;
alter table qa_file_audits enable row level security;
drop policy if exists qs_all on qa_standards;
drop policy if exists qe_all on qa_evidence;
drop policy if exists qfa_all on qa_file_audits;
create policy qs_all on qa_standards for all to authenticated using (coalesce(app_level(), 0) >= 4) with check (coalesce(app_level(), 0) >= 4);
create policy qe_all on qa_evidence for all to authenticated using (coalesce(app_level(), 0) >= 4) with check (coalesce(app_level(), 0) >= 4);
create policy qfa_all on qa_file_audits for all to authenticated using (coalesce(app_level(), 0) >= 4) with check (coalesce(app_level(), 0) >= 4);

-- COA sections to start from (directors add the numbered standards under each, e.g. "PQI 2").
insert into qa_standards (code, area, title) values
  ('GOV', 'GOV', 'Governance'),
  ('FIN', 'FIN', 'Financial Management'),
  ('PQI', 'PQI', 'Performance and Quality Improvement'),
  ('RPM', 'RPM', 'Risk Prevention and Management'),
  ('HR',  'HR',  'Human Resources'),
  ('TS',  'TS',  'Training and Supervision'),
  ('ASE', 'ASE', 'Administrative and Service Environment'),
  ('BSM', 'BSM', 'Behavior Support and Management'),
  ('CR',  'CR',  'Client Rights'),
  ('GLS', 'GLS', 'Group Living Services')
on conflict (code) do nothing;

-- Evidence files: private, 10 MB, documents and images; directors only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qa-evidence', 'qa-evidence', false, 10485760, array[
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "qa evidence upload" on storage.objects;
drop policy if exists "qa evidence read" on storage.objects;
create policy "qa evidence upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'qa-evidence' and coalesce(app_level(), 0) >= 4);
create policy "qa evidence read" on storage.objects for select to authenticated
  using (bucket_id = 'qa-evidence' and coalesce(app_level(), 0) >= 4);

-- Audit trail (who changed what), like the other records.
drop trigger if exists audit_survey_sends on survey_sends;
drop trigger if exists audit_qa_standards on qa_standards;
drop trigger if exists audit_qa_file_audits on qa_file_audits;
create trigger audit_survey_sends after insert or update or delete on survey_sends for each row execute function write_audit();
create trigger audit_qa_standards after insert or update or delete on qa_standards for each row execute function write_audit();
create trigger audit_qa_file_audits after insert or update or delete on qa_file_audits for each row execute function write_audit();

-- Check: should say 5 tables, 10 COA sections
select (select count(*) from information_schema.tables where table_name in ('survey_sends','qa_monthly_reviews','qa_standards','qa_evidence','qa_file_audits')) as tables,
       (select count(*) from qa_standards) as coa_sections;
