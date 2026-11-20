-- =====================================================================
-- Evergreen CRM - Careers page and online job applications (plan B5, Nov 20, 2026).
-- Melvin (Nov 20): HR does everything (creates, publishes and closes postings, reviews applications);
-- the Administrator can check everything; the CEO can read (CEO sees everything rule, Nov 11).
--   * job_postings: Job ID ECC-JOB-YYYY-NNN, position, program, house/area, full/part-time, shift team, wage range
--     (required before publishing: B.C. pay transparency), closing date. Status Draft -> Open -> Closed.
--   * job_applications: started from a public posting with name + email; the applicant opens their private link
--     with a 6-digit email code (no portal account), fills in 12 sections, uploads a resume (and optional cover
--     letter), and signs. HR moves it New -> Screened -> Interview -> References -> Pre-screening -> Offer -> Hired /
--     Not selected. Pre-screening opens a pre-screening file already filled in with the applicant's details.
--   * Not hired: deleted 1 year after the decision (B.C. PIPA); drafts never sent are deleted after 60 days.
-- All public access goes through the server (service key) after the token + email code check; nothing is open to anon.
-- Run as migration job_applications. Safe to re-run.
-- =====================================================================
create sequence if not exists public.job_posting_seq start 1;

create table if not exists public.job_postings (
  id uuid primary key default gen_random_uuid(),
  job_id text unique,
  title text not null check (length(title) <= 120),
  position text,
  program text not null default 'Both' check (program in ('MCFD','CLBC','Both')),
  location text check (length(location) <= 120),
  employment_type text not null default 'Full-time' check (employment_type in ('Full-time','Part-time','Full-time or part-time')),
  shift_team text check (shift_team in ('Day','Evening','Awake night','Any')),
  hours_per_week numeric,
  wage_min numeric check (wage_min is null or wage_min > 0),
  wage_max numeric check (wage_max is null or wage_max >= wage_min),
  wage_unit text not null default 'hour' check (wage_unit in ('hour','year')),
  summary text check (length(summary) <= 3000),
  duties text check (length(duties) <= 4000),
  requirements text check (length(requirements) <= 4000),
  drives boolean not null default false,
  closing_date date,
  status text not null default 'Draft' check (status in ('Draft','Open','Closed')),
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_postings_wage_to_open check (status <> 'Open' or (wage_min is not null and wage_max is not null))
);

create or replace function public.job_posting_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.job_id is null then
    new.job_id := 'ECC-JOB-' || to_char(now() at time zone evg_tz(), 'YYYY') || '-' || lpad(nextval('job_posting_seq')::text, 3, '0');
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists job_posting_id on public.job_postings;
create trigger job_posting_id before insert or update on public.job_postings for each row execute function public.job_posting_id();

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public.job_postings(id) on delete restrict,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  first_name text not null check (length(first_name) <= 80),
  last_name text check (length(last_name) <= 80),
  email text not null check (length(email) <= 200),
  phone text check (length(phone) <= 40),
  answers jsonb not null default '{}'::jsonb check (pg_column_size(answers) < 200000),
  flags text[] not null default '{}',
  resume_path text,
  resume_name text,
  cover_path text,
  cover_name text,
  status text not null default 'Draft' check (status in ('Draft','New','Screened','Interview','References','Pre-screening','Offer','Hired','Not selected','Withdrawn')),
  signed_name text,
  submitted_at timestamptz,
  signer_ip text,
  -- email code to open the private link
  otp_hash text, otp_sent_at timestamptz, otp_expires_at timestamptz, otp_attempts int not null default 0,
  session_hash text, verified_at timestamptz,
  -- HR
  hr_notes text check (length(hr_notes) <= 6000),
  prescreen_id uuid references public.prescreens(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  decline_emailed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists job_applications_one_per_posting on public.job_applications (posting_id, lower(email));
create index if not exists job_applications_status on public.job_applications (posting_id, status);

create or replace function public.can_hr_jobs(write boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select app_role() = 'admin' or coalesce(app_group(), '') = 'hr'
      or (not write and coalesce(app_level(), 0) >= 7 and coalesce(app_group(), '') = '');
$$;
revoke execute on function public.can_hr_jobs(boolean) from public, anon;
grant execute on function public.can_hr_jobs(boolean) to authenticated;

alter table public.job_postings enable row level security;
drop policy if exists job_postings_read on public.job_postings;
create policy job_postings_read on public.job_postings for select using (can_hr_jobs(false));
drop policy if exists job_postings_write on public.job_postings;
create policy job_postings_write on public.job_postings for all using (can_hr_jobs(true)) with check (can_hr_jobs(true));

alter table public.job_applications enable row level security;
drop policy if exists job_applications_read on public.job_applications;
create policy job_applications_read on public.job_applications for select using (can_hr_jobs(false) and status <> 'Draft');
drop policy if exists job_applications_edit on public.job_applications;
create policy job_applications_edit on public.job_applications for update using (can_hr_jobs(true)) with check (can_hr_jobs(true));
-- Applicants never use these tables directly; the server does, after the token + code check.

-- HR may change only their own fields; the applicant's signed answers stay locked.
create or replace function public.job_application_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null and current_user <> 'service_role' then
    if new.answers is distinct from old.answers or new.signed_name is distinct from old.signed_name
       or new.submitted_at is distinct from old.submitted_at or new.resume_path is distinct from old.resume_path
       or new.cover_path is distinct from old.cover_path or new.email is distinct from old.email
       or new.token is distinct from old.token or new.posting_id is distinct from old.posting_id then
      raise exception 'The applicant''s signed application can''t be changed.';
    end if;
    if new.status is distinct from old.status and new.status in ('Hired','Not selected') then
      new.decided_at := now(); new.decided_by := auth.uid();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists job_application_guard on public.job_applications;
create trigger job_application_guard before update on public.job_applications for each row execute function public.job_application_guard();

drop trigger if exists audit_job_postings on public.job_postings;
drop trigger if exists audit_job_applications on public.job_applications;
do $$ begin
  if exists (select 1 from pg_proc where proname = 'write_audit') then
    execute 'create trigger audit_job_postings after insert or update or delete on public.job_postings for each row execute function write_audit()';
    execute 'create trigger audit_job_applications after insert or update or delete on public.job_applications for each row execute function write_audit()';
  end if;
end $$;

-- Tell HR (and the Administrator) a new application came in.
create or replace function public.notify_hr_jobs(t text, b text, l text, k text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from profiles where active and (role = 'admin' or staff_group = 'hr') loop
    perform notify(r.id, t, b, l, k || ':' || r.id);
  end loop;
end $$;
revoke execute on function public.notify_hr_jobs(text, text, text, text) from public, anon, authenticated;
grant execute on function public.notify_hr_jobs(text, text, text, text) to service_role;

-- Daily job: delete applications that didn't lead to a hire, 1 year after the decision; and drafts never sent
-- after 60 days. Their files are removed by the daily job (it returns the file paths).
create or replace function public.job_applications_purge() returns text[]
language plpgsql security definer set search_path = public as $$
declare paths text[];
begin
  with gone as (
    delete from job_applications
     where (status in ('Not selected','Withdrawn') and coalesce(decided_at, updated_at) < now() - interval '1 year')
        or (status = 'Draft' and created_at < now() - interval '60 days')
    returning resume_path, cover_path)
  select coalesce(array_agg(x) filter (where x is not null), '{}') into paths
    from (select resume_path x from gone union all select cover_path from gone) s;
  return paths;
end $$;
revoke execute on function public.job_applications_purge() from public, anon, authenticated;
grant execute on function public.job_applications_purge() to service_role;

-- Private file store for resumes and cover letters (2 MB, PDF or Word). Only HR / Admin / CEO can open them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applications', 'applications', false, 2097152,
        array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "applications read" on storage.objects;
create policy "applications read" on storage.objects for select to authenticated using (bucket_id = 'applications' and can_hr_jobs(false));
