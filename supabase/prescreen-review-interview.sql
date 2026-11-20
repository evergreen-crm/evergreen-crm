-- =====================================================================
-- Evergreen CRM - Pre-screening: application number, availability, documents, review decision, interview (Nov 20, 2026).
-- Melvin (Nov 20):
--   * Every application gets an application number, e.g. ECC-APP-2611-0007 (YYMM = month received, NNNN never
--     reused). A pre-screen opened from a Careers application keeps that application's number.
--   * When an applicant sends their pre-screen, HR, the Administrator and the Program Coordinators / Program
--     Managers who review pre-screens get an alert.
--   * The applicant gives their availability for an interview and uploads their resume and photos or PDFs of their
--     certificates. Nothing about an interview happens until a reviewer decides the pre-screen passes; the reviewer
--     then sets the interview from the applicant's availability, and the applicant is emailed the details.
-- Run as migration prescreen_review_interview. Safe to re-run.
-- =====================================================================
create sequence if not exists public.application_no_seq start 1;

create or replace function public.next_application_no() returns text
language sql security definer set search_path = public as $$
  select 'ECC-APP-' || to_char(now() at time zone evg_tz(), 'YYMM') || '-' || lpad(nextval('application_no_seq')::text, 4, '0');
$$;
revoke execute on function public.next_application_no() from public, anon, authenticated;

alter table public.job_applications add column if not exists application_no text unique;
alter table public.prescreens add column if not exists application_no text unique;
alter table public.prescreens add column if not exists prefill jsonb;
alter table public.prescreens add column if not exists cert_files jsonb not null default '[]'::jsonb;
alter table public.prescreens add column if not exists screen_decision text check (screen_decision in ('Passed','Not passed'));
alter table public.prescreens add column if not exists screen_note text check (length(screen_note) <= 2000);
alter table public.prescreens add column if not exists screen_decided_by uuid references public.profiles(id);
alter table public.prescreens add column if not exists screen_decided_at timestamptz;
alter table public.prescreens add column if not exists interview_at timestamptz;
alter table public.prescreens add column if not exists interview_format text check (interview_format in ('In person','Video call','Phone'));
alter table public.prescreens add column if not exists interview_where text check (length(interview_where) <= 500);
alter table public.prescreens add column if not exists interview_with uuid[] not null default '{}';
alter table public.prescreens add column if not exists interview_note text check (length(interview_note) <= 1000);
alter table public.prescreens add column if not exists interview_set_by uuid references public.profiles(id);
alter table public.prescreens add column if not exists interview_emailed_at timestamptz;
alter table public.prescreens add column if not exists interview_reminded_at timestamptz;
alter table public.prescreens add column if not exists decline_emailed_at timestamptz;

-- Numbers: job applications get one when they are sent; pre-screens when they are made (unless they came from a
-- Careers application, which passes its number on).
create or replace function public.job_application_no() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.application_no is null and new.status <> 'Draft' then new.application_no := next_application_no(); end if;
  return new;
end $$;
drop trigger if exists job_application_no on public.job_applications;
create trigger job_application_no before insert or update of status on public.job_applications for each row execute function public.job_application_no();

create or replace function public.prescreen_application_no() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.application_no is null then new.application_no := next_application_no(); end if;
  return new;
end $$;
drop trigger if exists prescreen_application_no on public.prescreens;
create trigger prescreen_application_no before insert on public.prescreens for each row execute function public.prescreen_application_no();
revoke execute on function public.job_application_no(), public.prescreen_application_no() from public, anon, authenticated;

-- Number the ones already there (oldest first).
do $$ declare r record; begin
  for r in select id from job_applications where application_no is null and status <> 'Draft' order by coalesce(submitted_at, created_at) loop
    update job_applications set application_no = next_application_no() where id = r.id; end loop;
  for r in select id from prescreens where application_no is null order by created_at loop
    update prescreens set application_no = next_application_no() where id = r.id; end loop;
end $$;

-- Alert the reviewers that a pre-screen came in (called by the server when the applicant signs).
create or replace function public.notify_prescreen_reviewers(pid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare p record; r record; n int := 0;
begin
  select id, first_name, last_name, application_no, position into p from prescreens where id = pid;
  if p.id is null then return 0; end if;
  for r in select id from profiles x
            where x.active and (x.role = 'admin' or x.staff_group = 'hr' or (coalesce(x.level, 0) >= 7 and x.staff_group is null)
                  or exists (select 1 from prescreen_access a where a.profile_id = x.id)) loop
    perform notify(r.id, 'Pre-screen received: ' || p.first_name || coalesce(' ' || p.last_name, '') || ' (' || p.application_no || ')',
      coalesce(p.position || ' · ', '') || 'Review it and decide whether it passes before any interview is booked.',
      '/hr/prescreen/' || p.id || '?tab=application', 'prescreen-in:' || p.id || ':' || r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.notify_prescreen_reviewers(uuid) from public, anon, authenticated;
grant execute on function public.notify_prescreen_reviewers(uuid) to service_role;

-- Daily job: interviews tomorrow -> remind the interviewers (the server emails the applicant).
create or replace function public.prescreen_interviews_tomorrow() returns table (id uuid, first_name text, email text, application_no text,
  interview_at timestamptz, interview_format text, interview_where text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare t date := (now() at time zone evg_tz())::date + 1; r record; w uuid;
begin
  for r in select * from prescreens p where p.screen_decision = 'Passed' and p.interview_at is not null and p.interview_reminded_at is null
             and (p.interview_at at time zone evg_tz())::date = t loop
    foreach w in array r.interview_with loop
      perform notify(w, 'Interview tomorrow: ' || r.first_name || coalesce(' ' || r.last_name, '') || ' (' || r.application_no || ')',
        to_char(r.interview_at at time zone evg_tz(), 'Dy Mon DD at HH12:MI AM') || ' · ' || coalesce(r.interview_format, '') || coalesce(' · ' || r.interview_where, ''),
        '/hr/prescreen/' || r.id || '?tab=interview', 'prescreen-int-rem:' || r.id || ':' || w);
    end loop;
    update prescreens set interview_reminded_at = now() where prescreens.id = r.id;
    id := r.id; first_name := r.first_name; email := r.email; application_no := r.application_no;
    interview_at := r.interview_at; interview_format := r.interview_format; interview_where := r.interview_where;
    return next;
  end loop;
end $$;
revoke execute on function public.prescreen_interviews_tomorrow() from public, anon, authenticated;
grant execute on function public.prescreen_interviews_tomorrow() to service_role;

-- Resumes and certificate photos: allow pictures as well as PDF / Word.
update storage.buckets set allowed_mime_types = array['application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png']
 where id = 'applications';
