-- =====================================================================
-- Evergreen CRM - Pre-screening: link emailed automatically, resume upload (Nov 20, 2026).
-- Melvin: once HR adds the applicant's name, email and phone, the applicant should get the link automatically
-- and be able to complete everything there, including uploading their resume; their references are emailed
-- automatically (already the case since the reference checks build).
--   * link_emailed_at / link_emailed_to: when the portal emailed the private link (on create, on a new link).
--   * resume / cover letter on the pre-screening file (PDF or Word, 2 MB), stored in the private "applications"
--     bucket under prescreen/<id>/. Anyone with pre-screening access (HR, Administrator, CEO, interviewers) can
--     open them. Locked once the prescreen is signed.
-- Run as migration prescreen_resume_autolink. Safe to re-run.
-- =====================================================================
alter table public.prescreens add column if not exists link_emailed_at timestamptz;
alter table public.prescreens add column if not exists link_emailed_to text;
alter table public.prescreens add column if not exists resume_path text;
alter table public.prescreens add column if not exists resume_name text;
alter table public.prescreens add column if not exists cover_path text;
alter table public.prescreens add column if not exists cover_name text;

create or replace function public.prescreen_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := prescreen_role();
begin
  if old.link_status = 'Submitted' and (
       new.application is distinct from old.application or new.signature is distinct from old.signature
    or new.signed_name is distinct from old.signed_name or new.signed_at is distinct from old.signed_at
    or new.link_status is distinct from old.link_status
    or new.resume_path is distinct from old.resume_path or new.cover_path is distinct from old.cover_path) then
    raise exception 'A signed prescreen cannot be changed.';
  end if;
  if r = 'interviewer' and (
       new.program is distinct from old.program or new.drives is distinct from old.drives
    or new.gives_meds is distinct from old.gives_meds or new.lived_outside is distinct from old.lived_outside
    or new.post is distinct from old.post or new.file_status is distinct from old.file_status
    or new.restrictions is distinct from old.restrictions or new.token is distinct from old.token) then
    raise exception 'Interviewers can only record interviews, reference checks and screening items.';
  end if;
  if r is not null and r <> 'admin' and (new.items -> 'exec') is distinct from (old.items -> 'exec') then
    raise exception 'Only the administrator can sign executive approval.';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Resumes on pre-screening files: readable by anyone with pre-screening access.
drop policy if exists "applications read prescreen" on storage.objects;
create policy "applications read prescreen" on storage.objects for select to authenticated using (
  bucket_id = 'applications' and (storage.foldername(name))[1] = 'prescreen' and prescreen_role() is not null
);
