-- Evergreen Academy online courses: quiz attempts.
-- Safe to run more than once.
create table if not exists public.course_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  course_key text not null,
  score int not null check (score >= 0),
  total int not null check (total > 0),
  passed boolean not null default false,
  answers jsonb,
  created_at timestamptz not null default now()
);
create index if not exists course_attempts_person on public.course_attempts (profile_id, course_key, created_at desc);

alter table public.course_attempts enable row level security;

drop policy if exists course_attempts_insert_own on public.course_attempts;
create policy course_attempts_insert_own on public.course_attempts
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists course_attempts_select on public.course_attempts;
create policy course_attempts_select on public.course_attempts
  for select to authenticated using (
    profile_id = auth.uid() or public.app_level() >= 3 or public.app_group() = 'hr'
  );
-- No update/delete policies: attempts are a permanent record.

drop trigger if exists course_attempts_audit on public.course_attempts;
create trigger course_attempts_audit after insert or update or delete on public.course_attempts
  for each row execute function public.write_audit();
